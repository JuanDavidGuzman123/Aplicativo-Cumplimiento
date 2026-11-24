import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import ExcelJS from 'exceljs'
import {
  FIELD_ALIASES,
  cellText,
  findHeaderIndex,
  uuidFromDocument,
  type ColocadoresPrepareResult,
  type WorkbookField,
} from './colocadores-workbook.util.js'
import {
  saveWorkbookSafely,
  WorkbookSafetyError,
  type WorkbookCellChange,
} from './workbook-safe-save.js'

export type WorkbookFieldsSnapshot = {
  followUp: string
  observations: string
}

@Injectable()
export class ColocadoresWorkbookWriterService {
  private readonly logger = new Logger(ColocadoresWorkbookWriterService.name)

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
      const document = cellText(sheet.getCell(rowNumber, documentIndex + 1))
      const followUp = cellText(
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
    await this.write(
      filePath,
      worksheetName,
      (document) => uuidFromDocument(document) === id,
      fields,
      'FR-SG-81',
    )
  }

  async writeFieldsByDocument(
    filePath: string,
    worksheetName: string,
    document: string,
    fields: Partial<Record<WorkbookField, string>>,
    label = 'FR-SG-81',
  ): Promise<WorkbookFieldsSnapshot> {
    return this.write(
      filePath,
      worksheetName,
      (candidate) => this.documentsMatch(candidate, document),
      fields,
      label,
    )
  }

  private async write(
    filePath: string,
    worksheetName: string,
    matches: (document: string) => boolean,
    fields: Partial<Record<WorkbookField, string>>,
    label: string,
  ): Promise<WorkbookFieldsSnapshot> {
    const followUp = fields.followUp
    const observations = fields.observations

    if (followUp === undefined) {
      throw new ServiceUnavailableException(
        'No se indicó el valor de Seguimiento Si/No',
      )
    }

    const workbook = await this.read(filePath, label)
    const sheet = this.sheet(workbook, worksheetName, label)
    const headerRowNumber = this.headerRowNumber(sheet, label)
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
        `No se encontraron Numero de documento, Seguimiento Si/No u Observaciones en ${label}`,
      )
    }

    const targetRow = this.findTargetRow(
      sheet,
      headerRowNumber,
      documentIndex,
      followUpIndex,
      matches,
    )

    if (!targetRow) {
      throw new ServiceUnavailableException(
        `No se encontró la fila de la contraparte en ${label}`,
      )
    }

    const changes: WorkbookCellChange[] = []
    const followUpCell = sheet.getCell(targetRow, followUpIndex + 1)
    const observationsCell = sheet.getCell(
      targetRow,
      observationsIndex + 1,
    )
    const previous = {
      followUp: cellText(followUpCell),
      observations: cellText(observationsCell),
    }

    if (cellText(followUpCell).toLowerCase() !== followUp.toLowerCase()) {
      changes.push({
        worksheet: sheet.name,
        row: targetRow,
        column: followUpIndex + 1,
        value: followUp,
      })
    }

    if (observations !== undefined) {
      if (cellText(observationsCell) !== observations) {
        changes.push({
          worksheet: sheet.name,
          row: targetRow,
          column: observationsIndex + 1,
          value: observations,
        })
      }
    }

    if (changes.length > 0) {
      await this.save(filePath, changes, label)
    }

    return previous
  }

  private findTargetRow(
    sheet: ExcelJS.Worksheet,
    headerRowNumber: number,
    documentIndex: number,
    followUpIndex: number,
    matches: (document: string) => boolean,
  ): number {
    let fallback = 0

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const document = cellText(sheet.getCell(rowNumber, documentIndex + 1))

      if (!document || !matches(document)) {
        continue
      }

      if (!fallback) {
        fallback = rowNumber
      }

      const followUp = cellText(
        sheet.getCell(rowNumber, followUpIndex + 1),
      ).toLowerCase()

      if (followUp === 'si' || followUp === 'no') {
        return rowNumber
      }
    }

    return fallback
  }

  private documentsMatch(left: string, right: string): boolean {
    const leftText = left.trim()
    const rightText = right.trim()

    if (leftText === rightText) {
      return true
    }

    const leftDigits = leftText.replace(/\D/g, '')
    const rightDigits = rightText.replace(/\D/g, '')

    return Boolean(leftDigits) && leftDigits === rightDigits
  }

  private async read(
    filePath: string,
    label = 'FR-SG-81',
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook()

    try {
      await workbook.xlsx.readFile(filePath)
      return workbook
    } catch {
      throw new ServiceUnavailableException(
        `No se pudo abrir el libro ${label}`,
      )
    }
  }

  private async save(
    filePath: string,
    changes: WorkbookCellChange[],
    label: string,
  ): Promise<void> {
    try {
      await saveWorkbookSafely(filePath, changes)
    } catch (error) {
      if (error instanceof WorkbookSafetyError) {
        this.logger.error(error.message)
        throw new ServiceUnavailableException(
          'No se guardó el libro porque la validación detectó cambios fuera de Seguimiento y Observaciones. El archivo original quedó intacto.',
        )
      }

      const code = (error as NodeJS.ErrnoException).code

      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        throw new ServiceUnavailableException(
          `${label} está abierto o bloqueado. Ciérralo en Excel y vuelve a intentarlo.`,
        )
      }

      throw new ServiceUnavailableException(
        `No se pudo guardar ${label}. El archivo original quedó intacto.`,
      )
    }
  }

  private sheet(
    workbook: ExcelJS.Workbook,
    worksheetName: string,
    label = 'FR-SG-81',
  ): ExcelJS.Worksheet {
    const sheet =
      workbook.getWorksheet(worksheetName) ?? workbook.worksheets[0]

    if (!sheet) {
      throw new ServiceUnavailableException(
        `No se encontró la hoja ${label}`,
      )
    }

    return sheet
  }

  private headerRowNumber(
    sheet: ExcelJS.Worksheet,
    label = 'FR-SG-81',
  ): number {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
      const headers = this.headerValues(sheet, rowNumber)

      if (findHeaderIndex(headers, FIELD_ALIASES.document) >= 0) {
        return rowNumber
      }
    }

    throw new ServiceUnavailableException(
      `No se encontró la fila de encabezados de ${label}`,
    )
  }

  private headerValues(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
  ): string[] {
    const values: string[] = []

    for (let column = 1; column <= sheet.columnCount; column += 1) {
      values.push(cellText(sheet.getCell(rowNumber, column)))
    }

    return values
  }

}
