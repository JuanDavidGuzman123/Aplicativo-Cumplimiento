import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
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
