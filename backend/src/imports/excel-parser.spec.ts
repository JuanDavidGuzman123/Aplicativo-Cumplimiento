import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  cellText,
  getFieldValue,
  normalizeHeader,
  parseImportedDate,
  parseWorkbook,
  suggestMapping,
} from './excel-parser.js'

describe('excel-parser', () => {
  it('normalizes accents, case and separators in headers', () => {
    expect(normalizeHeader('  Fecha de Registro ')).toBe(
      'fecha de registro',
    )
    expect(normalizeHeader('Razón Social')).toBe('razon social')
    expect(normalizeHeader('NIT / Cédula')).toBe('nit cedula')
  })

  it('parses supported date formats and rejects invalid dates', () => {
    expect(parseImportedDate('01/01/2026')).toBe('2026-01-01')
    expect(parseImportedDate('2026-08-31')).toBe('2026-08-31')
    expect(parseImportedDate('1/1/26')).toBe('2026-01-01')
    expect(parseImportedDate('45658')).toBe('2025-01-01')
    expect(parseImportedDate('31/02/2026')).toBeNull()
    expect(parseImportedDate('2026-02-29')).toBeNull()
  })

  it('suggests mappings from common Excel aliases', () => {
    const mapping = suggestMapping([
      { value: 'nit', label: 'NIT' },
      { value: 'razon social', label: 'Razón Social' },
      { value: 'subproceso', label: 'Subproceso' },
      {
        value: 'fecha de proximo seguimiento',
        label: 'Fecha de próximo seguimiento',
      },
    ])

    expect(mapping.nit).toBe('nit')
    expect(mapping.businessName).toBe('razon social')
    expect(mapping.subprocess).toBe('subproceso')
    expect(mapping.nextFollowUpDate).toBe(
      'fecha de proximo seguimiento',
    )
  })

  it('reads workbooks, skips empty rows and preserves the origin', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Contrapartes')
    const secondSheet = workbook.addWorksheet('Hoja 2')

    sheet.addRow([
      'NIT',
      'Razón Social',
      'Subproceso',
      'Fecha de registro',
      'Fecha de próximo seguimiento',
      'Observaciones',
    ])
    sheet.addRow([
      '900.123.456-7',
      'ACME SAS',
      'Compras',
      '01/01/2026',
      '2026-07-01',
      'Alta',
    ])
    sheet.addRow([])
    secondSheet.addRow(['NIT', 'Razón Social', 'Subproceso'])
    secondSheet.addRow(['900 123 456', 'Beta', 'Compras'])

    const buffer = Buffer.from(
      await workbook.xlsx.writeBuffer(),
    )
    const parsed = await parseWorkbook(buffer, 'contrapartes.xlsx')
    const sheetData = parsed.files[0].sheets[0]
    const secondSheetData = parsed.files[0].sheets[1]

    expect(parsed.files[0].fileName).toBe('contrapartes.xlsx')
    expect(parsed.totalRows).toBe(2)
    expect(sheetData.rows).toHaveLength(1)
    expect(sheetData.rows[0].rowNumber).toBe(2)
    expect(secondSheetData.rows[0].rowNumber).toBe(2)
    expect(parsed.suggestedMapping.nit).toBe('nit')
    expect(
      getFieldValue(
        sheetData,
        sheetData.rows[0],
        parsed.suggestedMapping,
        'businessName',
      ),
    ).toBe('ACME SAS')
    expect(
      getFieldValue(
        sheetData,
        sheetData.rows[0],
        parsed.suggestedMapping,
        'registrationDate',
      ),
    ).toBe('01/01/2026')
  })

  it('never throws for unusual cell values', () => {
    const fakeCell = (value: unknown, text: unknown) =>
      ({ value, text }) as unknown as ExcelJS.Cell

    expect(cellText(fakeCell('  texto  ', '  texto  '))).toBe(
      'texto',
    )
    expect(cellText(fakeCell(42, 42))).toBe('42')
    expect(cellText(fakeCell({ imageId: 1 }, undefined))).toBe('')
    expect(cellText(fakeCell({ text: 123 }, 123))).toBe('')
  })

  it('rejects a workbook without data rows', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Vacía')
    sheet.addRow(['NIT', 'Razón Social'])
    const buffer = Buffer.from(
      await workbook.xlsx.writeBuffer(),
    )

    await expect(
      parseWorkbook(buffer, 'vacia.xlsx'),
    ).rejects.toThrow(/no contiene hojas con datos/)
  })
})
