import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import {
  FIELD_ALIASES,
  findHeaderIndex,
  normalizeCell,
  uuidFromDocument,
  type ColocadoresPrepareResult,
  type WorkbookField,
} from './colocadores-workbook.util.js'

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
    const documentIndex = findHeaderIndex(headers, FIELD_ALIASES.document)
    const followUpIndex = findHeaderIndex(headers, FIELD_ALIASES.followUp)
    const observationsIndex = findHeaderIndex(
      headers,
      FIELD_ALIASES.observations,
    )

    if (
      documentIndex < 0 ||
      followUpIndex < 0 ||
      observationsIndex < 0
    ) {
      throw new ServiceUnavailableException(
        'No se encontraron Numero de documento, Seguimiento Si/No u Observaciones en FR-SG-81',
      )
    }

    let followUpRows = 0

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const document = this.cellText(sheet.getCell(rowNumber, documentIndex + 1))
      const followUp = this.cellText(
        sheet.getCell(rowNumber, followUpIndex + 1),
      ).toLowerCase()

      if (document && (followUp === 'si' || followUp === 'no')) {
        followUpRows += 1
      }
    }

    return {
      sourceRows: Math.max(0, sheet.rowCount - headerRowNumber),
      followUpRows,
      created: 0,
      alreadyExisting: followUpRows,
      skippedInvalid: 0,
    }
  }

  async writeFields(
    filePath: string,
    worksheetName: string,
    id: string,
    fields: Partial<Record<WorkbookField, string>>,
  ): Promise<void> {
    const followUp = fields.followUp
    const observations = fields.observations

    if (followUp === undefined) {
      throw new ServiceUnavailableException(
        'No se indicó el valor de Seguimiento Si/No',
      )
    }

    const workbook = await this.read(filePath)
    const sheet = this.sheet(workbook, worksheetName)
    const headerRowNumber = this.headerRowNumber(sheet)
    const headers = this.headerValues(sheet, headerRowNumber)
    const documentIndex = findHeaderIndex(headers, FIELD_ALIASES.document)
    const followUpIndex = findHeaderIndex(headers, FIELD_ALIASES.followUp)
    const observationsIndex = findHeaderIndex(
      headers,
      FIELD_ALIASES.observations,
    )

    if (
      documentIndex < 0 ||
      followUpIndex < 0 ||
      observationsIndex < 0
    ) {
      throw new ServiceUnavailableException(
        'No se encontraron Numero de documento, Seguimiento Si/No u Observaciones en FR-SG-81',
      )
    }

    let targetRow = 0

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const document = this.cellText(sheet.getCell(rowNumber, documentIndex + 1))

      if (document && uuidFromDocument(document) === id) {
        targetRow = rowNumber
        break
      }
    }

    if (!targetRow) {
      throw new ServiceUnavailableException(
        'No se encontró la fila de la contraparte en FR-SG-81',
      )
    }

    let changed = false
    const followUpCell = sheet.getCell(targetRow, followUpIndex + 1)

    if (this.cellText(followUpCell).toLowerCase() !== followUp.toLowerCase()) {
      followUpCell.value = followUp
      changed = true
    }

    if (observations !== undefined) {
      const observationsCell = sheet.getCell(
        targetRow,
        observationsIndex + 1,
      )

      if (this.cellText(observationsCell) !== observations) {
        observationsCell.value = observations
        changed = true
      }
    }

    if (changed) {
      await this.save(workbook, filePath)
    }
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

  private async save(
    workbook: ExcelJS.Workbook,
    filePath: string,
  ): Promise<void> {
    try {
      await workbook.xlsx.writeFile(filePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code

      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        throw new ServiceUnavailableException(
          'FR-SG-81 está abierto o bloqueado. Ciérralo en Excel y vuelve a intentarlo.',
        )
      }

      throw error
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

    if (value && typeof value === 'object') {
      const richText = value as { richText?: { text?: unknown }[]; text?: unknown }

      if (Array.isArray(richText.richText)) {
        return richText.richText
          .map((item) => this.valueToText(item.text))
          .join('')
      }

      if ('text' in richText) {
        return this.valueToText(richText.text)
      }
    }

    return ''
  }
}
