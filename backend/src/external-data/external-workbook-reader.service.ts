import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { parseWorkbook } from '../imports/excel-parser.js'
import { ExternalDataConfigService } from './external-data.config.service.js'
import { MicrosoftGraphService } from './microsoft-graph.service.js'
import type { ExternalImportHeader, ExternalWorkbookData, ExternalWorkbookRow } from './types.js'

@Injectable()
export class ExternalWorkbookReaderService {
  constructor(
    private readonly config: ExternalDataConfigService,
    private readonly graph: MicrosoftGraphService,
  ) {}

  async read(): Promise<ExternalWorkbookData> {
    if (this.config.source === 'file') {
      return this.readWorkbook(
        this.config.localWorkbookPath,
        this.config.worksheetName,
      )
    }

    return this.readGraph()
  }

  async readWorkbook(
    filePath: string,
    worksheetName?: string,
  ): Promise<ExternalWorkbookData> {
    if (!filePath) {
      throw new Error('Falta la ruta del libro local')
    }

    const fileStats = await stat(filePath).catch(() => null)

    if (!fileStats || !fileStats.isFile()) {
      throw new Error(`No se encontró el archivo local: ${filePath}`)
    }

    const extension = extname(filePath).toLowerCase()

    if (extension !== '.xlsx' && extension !== '.xlsm') {
      throw new Error('El archivo local debe ser .xlsx o .xlsm')
    }

    const fileName = basename(filePath)
    const buffer = await readFile(filePath).catch(() => {
      throw new Error(`No se pudo leer el archivo local: ${filePath}`)
    })
    const parsed = await parseWorkbook(buffer, fileName)
    const sheets = parsed.files[0]?.sheets ?? []

    if (sheets.length === 0) {
      throw new Error(
        'No se encontraron hojas con datos en el archivo local',
      )
    }

    const configuredWorksheet = worksheetName?.trim()
    const selectedSheet = configuredWorksheet
      ? sheets.find(
          (sheet) =>
            sheet.name.trim().toLowerCase() ===
            configuredWorksheet.toLowerCase(),
        )
      : sheets[0]

    if (!selectedSheet) {
      throw new Error(
        `No se encontró la hoja "${configuredWorksheet}". Hojas disponibles: ${sheets
          .map((sheet) => sheet.name)
          .join(', ')}`,
      )
    }

    const sourceName = `Hoja: ${selectedSheet.name}`
    const rows = selectedSheet.rows
      .slice(0, this.config.maxRows)
      .map((row) => ({
        rowNumber: row.rowNumber,
        values: row.values,
      }))

    return {
      fileName,
      sourceName,
      sourceUrl: null,
      tableOrWorksheet: sourceName,
      headers: selectedSheet.headers,
      rows,
      version: createHash('sha256').update(buffer).digest('hex'),
      lastModifiedDateTime: fileStats.mtime.toISOString(),
    }
  }

  private async readGraph(): Promise<ExternalWorkbookData> {
    const item = await this.graph.getDriveItem()
    const tables = await this.graph.listTables()
    const configuredTable = this.config.tableName
    const selectedTable =
      (configuredTable &&
        tables.find(
          (table) =>
            table.name === configuredTable ||
            table.id === configuredTable,
        )) ||
      tables[0]
    let sourceName = ''
    let rawHeaders: unknown[] = []
    let rawRows: unknown[][] = []

    if (selectedTable) {
      rawHeaders = await this.graph.getTableHeader(selectedTable.id)
      rawRows = await this.graph.getTableRows(selectedTable.id)
      sourceName = configuredTable
        ? selectedTable.name
        : `Tabla: ${selectedTable.name}`
    } else {
      const worksheets = await this.graph.listWorksheets()
      const configuredWorksheet = this.config.worksheetName
      const selectedWorksheet =
        (configuredWorksheet &&
          worksheets.find(
            (sheet) =>
              sheet.name === configuredWorksheet ||
              sheet.id === configuredWorksheet,
          )) ||
        worksheets[0]

      if (!selectedWorksheet) {
        throw new Error(
          'El libro externo no tiene tablas ni hojas de cálculo legibles',
        )
      }

      const values = await this.graph.getWorksheetValues(
        selectedWorksheet.id,
      )
      rawHeaders = values[0] ?? []
      rawRows = values.slice(1)
      sourceName = `Hoja: ${selectedWorksheet.name}`
    }

    if (rawHeaders.length === 0) {
      throw new Error('No se encontraron encabezados en el libro externo')
    }

    const headers = this.normalizeHeaders(rawHeaders)
    const rows = this.normalizeRows(rawRows, headers.length)
    const version = this.buildVersion(item, headers, rows)

    return {
      fileName: item.name,
      sourceName,
      sourceUrl: item.webUrl ?? null,
      tableOrWorksheet: sourceName,
      headers,
      rows,
      version,
      lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    }
  }

  private normalizeHeaders(values: unknown[]): ExternalImportHeader[] {
    const seen = new Map<string, number>()
    const result: ExternalImportHeader[] = []

    values.forEach((value, index) => {
      const label = this.cellToText(value)
      const baseValue =
        label ||
        `columna ${index + 1}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()
      const count = seen.get(baseValue) ?? 0
      seen.set(baseValue, count + 1)
      const suffix = count === 0 ? '' : ` ${count + 1}`

      result.push({
        value: `${baseValue}${suffix}`,
        label: label || `Columna ${index + 1}`,
      })
    })

    return result
  }

  private normalizeRows(
    values: unknown[][],
    columnCount: number,
  ): ExternalWorkbookRow[] {
    const limit = this.config.maxRows
    const rows: ExternalWorkbookRow[] = []

    values.forEach((row, index) => {
      if (rows.length >= limit) {
        return
      }

      const cells = Array.from(
        { length: columnCount },
        (_, cellIndex) => this.cellToText(row[cellIndex]),
      )

      if (cells.every((cell) => cell === '')) {
        return
      }

      rows.push({ rowNumber: index + 2, values: cells })
    })

    return rows
  }

  private cellToText(value: unknown): string {
    if (value === null || value === undefined) {
      return ''
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10)
    }

    if (typeof value === 'string') {
      return value.trim()
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false'
    }

    if (typeof value === 'object') {
      const candidate = value as {
        text?: unknown
        value?: unknown
      }
      if (typeof candidate.text === 'string') {
        return candidate.text.trim()
      }
      if (
        typeof candidate.value === 'string' ||
        typeof candidate.value === 'number'
      ) {
        return String(candidate.value).trim()
      }
    }

    return ''
  }

  private buildVersion(
    item: { eTag?: string | null; lastModifiedDateTime?: string | null },
    headers: ExternalImportHeader[],
    rows: ExternalWorkbookRow[],
  ): string {
    const payload = JSON.stringify({
      item: item.eTag ?? item.lastModifiedDateTime ?? '',
      headers: headers.map((header) => header.value),
      rows,
    })
    return createHash('sha256').update(payload).digest('hex')
  }
}
