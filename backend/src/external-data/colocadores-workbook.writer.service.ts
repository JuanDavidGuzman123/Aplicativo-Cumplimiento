import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { CounterpartyStatus } from '@prisma/client'
import ExcelJS from 'exceljs'
import {
  FIELD_ALIASES,
  findHeaderIndex,
  normalizeCell,
  statusFrom,
  uuidFromRowNumber,
  type ColocadoresPrepareResult,
  type FieldKey,
  type HeaderIndexes,
  type WorkbookField,
} from './colocadores-workbook.util.js'

const FIELD_TO_KEY: Record<WorkbookField, FieldKey> = {
  followUp: 'followUp',
  status: 'status',
  lastEvaluation: 'lastEvaluation',
  nextFollowUp: 'nextFollowUp',
  decision: 'decision',
  archivedAt: 'archivedAt',
  observations: 'observations',
}

const REQUIRED_HEADERS: [FieldKey, string][] = [
  ['id', 'ID Unico'],
  ['status', 'Estado'],
  ['lastEvaluation', 'Fecha Ultima Evaluacion'],
  ['nextFollowUp', 'Fecha Proximo Seguimiento'],
  ['decision', 'Resultado Evaluacion'],
  ['archivedAt', 'Fecha Archivado'],
]

@Injectable()
export class ColocadoresWorkbookWriterService {
  async prepare(
    filePath: string,
    worksheetName: string,
  ): Promise<ColocadoresPrepareResult> {
    const workbook = await this.read(filePath)
    const sheet = this.sheet(workbook, worksheetName)
    const headerRowNumber = this.headerRowNumber(sheet)
    const headers = this.headerValues(sheet, headerRowNumber)
    const indexes = this.indexes(headers)
    let createdHeaders = 0

    for (const [field, label] of REQUIRED_HEADERS) {
      if (indexes[field] !== undefined) {
        continue
      }

      let column = headers.length
      while (column > 0 && !normalizeCell(headers[column - 1])) {
        column -= 1
      }

      sheet.getCell(headerRowNumber, column + 1).value = label
      headers[column] = label
      indexes[field] = column
      createdHeaders += 1
    }

    const idIndex = indexes.id
    const documentIndex = indexes.document
    const followUpIndex = indexes.followUp
    const statusIndex = indexes.status

    if (
      idIndex === undefined ||
      documentIndex === undefined ||
      followUpIndex === undefined
    ) {
      throw new ServiceUnavailableException(
        'No se encontraron las columnas necesarias en FR-SG-81',
      )
    }

    let created = 0
    let followUpRows = 0

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const document = this.cellText(sheet.getCell(rowNumber, documentIndex + 1))
      const followUp = this.cellText(
        sheet.getCell(rowNumber, followUpIndex + 1),
      )
      const archived =
        statusIndex !== undefined &&
        statusFrom(sheet.getCell(rowNumber, statusIndex + 1).value) ===
          CounterpartyStatus.ARCHIVED

      if (!document || (followUp.toLowerCase() !== 'si' && !archived)) {
        continue
      }

      followUpRows += 1
      const idCell = sheet.getCell(rowNumber, idIndex + 1)

      if (!this.cellText(idCell)) {
        idCell.value = uuidFromRowNumber(rowNumber)
        created += 1
      }
    }

    if (created > 0 || createdHeaders > 0) {
      await workbook.xlsx.writeFile(filePath)
    }

    return {
      sourceRows: Math.max(0, sheet.rowCount - headerRowNumber),
      followUpRows,
      created,
      alreadyExisting: Math.max(0, followUpRows - created),
      skippedInvalid: 0,
    }
  }

  async writeFields(
    filePath: string,
    worksheetName: string,
    id: string,
    fields: Partial<Record<WorkbookField, string>>,
  ): Promise<void> {
    const workbook = await this.read(filePath)
    const sheet = this.sheet(workbook, worksheetName)
    const headerRowNumber = this.headerRowNumber(sheet)
    const indexes = this.indexes(
      this.headerValues(sheet, headerRowNumber),
    )
    const idIndex = indexes.id

    if (idIndex === undefined) {
      throw new ServiceUnavailableException(
        'No se encontró la columna ID Unico en FR-SG-81',
      )
    }

    let targetRow = 0

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      if (
        this.cellText(sheet.getCell(rowNumber, idIndex + 1)) === id
      ) {
        targetRow = rowNumber
        break
      }
    }

    if (!targetRow) {
      throw new ServiceUnavailableException(
        'No se encontró la fila de la contraparte en FR-SG-81',
      )
    }

    for (const [field, value] of Object.entries(fields)) {
      const key = FIELD_TO_KEY[field as WorkbookField]
      const column = indexes[key]

      if (column === undefined) {
        throw new ServiceUnavailableException(
          'Falta ejecutar la preparación de columnas de FR-SG-81',
        )
      }

      sheet.getCell(targetRow, column + 1).value = value ?? ''
    }

    await workbook.xlsx.writeFile(filePath)
  }

  private async read(filePath: string): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook()

    try {
      await workbook.xlsx.readFile(filePath)
      return workbook
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo abrir el libro FR-SG-81',
      )
    }
  }

  private sheet(
    workbook: ExcelJS.Workbook,
    worksheetName: string,
  ): ExcelJS.Worksheet {
    const sheet =
      workbook.getWorksheet(worksheetName) ?? workbook.worksheets[0]

    if (!sheet) {
      throw new ServiceUnavailableException(
        'No se encontró la hoja FR-SG-81',
      )
    }

    return sheet
  }

  private headerRowNumber(sheet: ExcelJS.Worksheet): number {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
      const headers = this.headerValues(sheet, rowNumber)

      if (findHeaderIndex(headers, FIELD_ALIASES.document) >= 0) {
        return rowNumber
      }
    }

    throw new ServiceUnavailableException(
      'No se encontró la fila de encabezados de FR-SG-81',
    )
  }

  private headerValues(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
  ): string[] {
    const values: string[] = []

    for (let column = 1; column <= sheet.columnCount; column += 1) {
      values.push(this.cellText(sheet.getCell(rowNumber, column)))
    }

    return values
  }

  private indexes(headers: string[]): HeaderIndexes {
    return Object.fromEntries(
      (Object.keys(FIELD_ALIASES) as FieldKey[]).map((field) => {
        const index = findHeaderIndex(headers, FIELD_ALIASES[field])
        return [field, index >= 0 ? index : undefined]
      }),
    ) as HeaderIndexes
  }

  private cellText(cell: ExcelJS.Cell): string {
    const value = cell.value

    if (value && typeof value === 'object' && 'result' in value) {
      return normalizeCell(this.valueToText(value.result))
    }

    return normalizeCell(this.valueToText(value))
  }

  private valueToText(value: unknown): string {
    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }

    if (value instanceof Date) {
      return value.toISOString()
    }

    if (Array.isArray(value)) {
      return value
        .map((item) =>
          item && typeof item === 'object' && 'text' in item
            ? this.valueToText(item.text)
            : this.valueToText(item),
        )
        .join('')
    }

    if (value && typeof value === 'object' && 'text' in value) {
      return this.valueToText(value.text)
    }

    return ''
  }
}
