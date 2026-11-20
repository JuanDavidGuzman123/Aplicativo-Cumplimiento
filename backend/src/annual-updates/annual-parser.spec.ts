import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  getAnnualFieldValue,
  normalizeAnnualCode,
  normalizeAnnualDate,
  normalizeAnnualStatus,
  normalizeAnnualYear,
  normalizeSemiannualFollowUp,
  parseAnnualWorkbook,
} from './annual-parser.js'

describe('annual-parser', () => {
  it('suggests and extracts the annual point-of-sale columns', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Base anual')
    sheet.addRow([
      'Código punto de venta',
      'Nombre',
      'Estado',
      'Fecha de diligenciamiento',
      'Año',
      'Tipo de debida diligencia',
      'Seguimiento',
      'Observaciones',
    ])
    sheet.addRow([
      'PDV-001',
      'Punto Uno',
      'A',
      '15/03/2026',
      2026,
      'Básica',
      'Sí',
      'Sin novedad',
    ])

    const parsed = await parseAnnualWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      'base-anual.xlsx',
    )

    expect(parsed.fileName).toBe('base-anual.xlsx')
    expect(parsed.suggestedMapping).toEqual({
      code: 'codigo punto de venta',
      businessName: 'nombre',
      status: 'estado',
      filingDate: 'fecha de diligenciamiento',
      filingYear: 'ano',
      dueDiligenceType: 'tipo de debida diligencia',
      requiresSemiannualFollowUp: 'seguimiento',
      observations: 'observaciones',
    })

    const row = parsed.rows[0]

    expect(
      getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        parsed.suggestedMapping,
        'code',
      ),
    ).toBe('PDV-001')
    expect(
      getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        parsed.suggestedMapping,
        'filingDate',
      ),
    ).toBe('15/03/2026')
    expect(
      getAnnualFieldValue(
        { headers: parsed.headers },
        row,
        parsed.suggestedMapping,
        'filingYear',
      ),
    ).toBe('2026')
  })

  it('recognizes common point-of-sale header variants', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Hoja1')
    sheet.addRow([
      'CODIGO PUNTO VENTA',
      'NOMBRE PDV',
      'A/I',
      'FECHA DILIGENCIAMIENTO',
      'ANO',
      'TIPO DEBIDA DILIGENCIA',
      'SEGUIMIENTO',
      'OBSERVACIONES',
    ])
    sheet.addRow([
      'PDV-002',
      'Punto Dos',
      'I',
      '2025-02-10',
      2025,
      'Avanzada',
      'No',
      'Revisar',
    ])

    const parsed = await parseAnnualWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      'variantes.xlsx',
    )

    expect(parsed.suggestedMapping).toEqual({
      code: 'codigo punto venta',
      businessName: 'nombre pdv',
      status: 'a i',
      filingDate: 'fecha diligenciamiento',
      filingYear: 'ano',
      dueDiligenceType: 'tipo debida diligencia',
      requiresSemiannualFollowUp: 'seguimiento',
      observations: 'observaciones',
    })
  })

  it('detects FR-SG style headers without manual mapping', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('FR-SG-79')
    sheet.addRow([
      'Nit o Número de documento',
      'Nombre y/o razón social',
      'Fecha Debida Diligencia',
      'Año',
      'Activo (A)\nInactivos (I)',
      'Excepciones\nSi / No',
      'Observaciones',
    ])
    sheet.addRow([
      '900123456',
      'Arrendadores S.A.S.',
      '2026-03-15',
      2026,
      'A',
      'No',
      'Sin novedad',
    ])

    const parsed = await parseAnnualWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      'fr-sg-79.xlsx',
    )

    expect(parsed.suggestedMapping).toEqual({
      code: 'nit o numero de documento',
      businessName: 'nombre y o razon social',
      status: 'activo a inactivos i',
      filingDate: 'fecha debida diligencia',
      filingYear: 'ano',
      dueDiligenceType: null,
      requiresSemiannualFollowUp: null,
      observations: 'observaciones',
    })
  })

  it('normalizes codes, statuses, follow-up values, dates and years', () => {
    expect(normalizeAnnualCode('  pdv-001  ')).toBe('PDV-001')
    expect(normalizeAnnualCode('pdv  001')).toBe('PDV 001')
    expect(normalizeAnnualStatus('A')).toBe('ACTIVE')
    expect(normalizeAnnualStatus('Activa')).toBe('ACTIVE')
    expect(normalizeAnnualStatus('I')).toBe('INACTIVE')
    expect(normalizeAnnualStatus('INACTIVO')).toBe('INACTIVE')
    expect(normalizeAnnualStatus('otro')).toBeNull()
    expect(normalizeSemiannualFollowUp('Sí')).toBe(true)
    expect(normalizeSemiannualFollowUp('no')).toBe(false)
    expect(normalizeSemiannualFollowUp(null)).toBeNull()
    expect(normalizeSemiannualFollowUp('   ')).toBeNull()
    expect(normalizeSemiannualFollowUp('tal vez')).toBeNull()
    expect(normalizeAnnualDate('2026-03-15')).toBe('2026-03-15')
    expect(normalizeAnnualDate('31/02/2026')).toBeNull()
    expect(normalizeAnnualYear('2026')).toBe(2026)
    expect(normalizeAnnualYear('2.026')).toBe(2026)
    expect(normalizeAnnualYear('2026.0')).toBe(2026)
    expect(normalizeAnnualYear('siglo')).toBeNull()
  })
})
