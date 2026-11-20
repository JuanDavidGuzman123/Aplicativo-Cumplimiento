import { describe, expect, it } from 'vitest'
import { ExternalAnnualMapperService } from './external-annual-mapper.service.js'
import type {
  ExternalAnnualMapping,
  ExternalWorkbookData,
} from './types.js'

const headers = [
  { value: 'code', label: 'Código' },
  { value: 'name', label: 'Nombre' },
  { value: 'status', label: 'Estado' },
  { value: 'date', label: 'Fecha' },
  { value: 'year', label: 'Año' },
  { value: 'type', label: 'Tipo' },
  { value: 'follow', label: 'Seguimiento' },
  { value: 'notes', label: 'Observaciones' },
]

const mapping: ExternalAnnualMapping = {
  code: 'code',
  businessName: 'name',
  status: 'status',
  filingDate: 'date',
  filingYear: 'year',
  dueDiligenceType: 'type',
  requiresSemiannualFollowUp: 'follow',
  observations: 'notes',
}

function workbook(
  rows: ExternalWorkbookData['rows'],
): ExternalWorkbookData {
  return {
    fileName: 'base.xlsx',
    sourceName: 'Base anual',
    sourceUrl: 'https://example.test/base.xlsx',
    tableOrWorksheet: 'Anual',
    headers,
    rows,
    version: 'v1',
    lastModifiedDateTime: '2026-11-20T12:00:00.000Z',
  }
}

describe('ExternalAnnualMapperService', () => {
  const service = new ExternalAnnualMapperService()

  it('dedupe por código y conserva la fila más reciente', () => {
    const result = service.mapWorkbook(
      workbook([
        {
          rowNumber: 2,
          values: [
            ' pdv-1 ',
            'Alfa SAS',
            'A',
            '2024-03-15',
            '2024',
            'Básica',
            'Sí',
            'Anterior',
          ],
        },
        {
          rowNumber: 3,
          values: [
            'PDV-1',
            'Alfa SAS',
            'A',
            '2025-03-15',
            '2025',
            'Básica',
            'No',
            'Reciente',
          ],
        },
        {
          rowNumber: 4,
          values: [
            'PDV-2',
            'Beta SAS',
            'N/A',
            '2025-03-15',
            '2025',
            'Básica',
            '',
            '',
          ],
        },
      ]),
      mapping,
      '2026-11-20T12:00:00.000Z',
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      code: 'PDV-1',
      filingYear: 2025,
      observations: 'Reciente',
    })
    expect(result.stats).toMatchObject({
      totalRows: 3,
      validRows: 1,
      ignoredRows: 1,
      errorRows: 1,
    })
    expect(result.mappingErrors).toEqual([])
  })

  it('acepta N/A y sin dato como ausencia de fecha sin descartar la fila', () => {
    const result = service.mapWorkbook(
      workbook([
        {
          rowNumber: 2,
          values: [
            'PDV-4',
            'Delta SAS',
            'A',
            'N/A',
            'sin dato',
            '',
            '',
            'Sin fecha',
          ],
        },
      ]),
      mapping,
      '2026-11-20T12:00:00.000Z',
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      filingDate: null,
      filingYear: null,
      annualStatus: 'NO_DATE',
    })
    expect(result.stats.errorRows).toBe(0)
  })

  it('valida el mapeo configurado por JSON', () => {
    const valid = service.resolveMapping(
      workbook([]),
      JSON.stringify({
        code: 'code',
        businessName: 'name',
        status: 'status',
        filingDate: 'date',
      }),
    )

    expect(valid.errors).toEqual([])
    expect(valid.mapping.code).toBe('code')
    expect(valid.mapping.observations).toBeNull()

    const invalid = service.resolveMapping(
      workbook([]),
      '{"code":"code","invented":"x"}',
    )

    expect(invalid.errors).toEqual([
      'El campo "invented" no es reconocido',
    ])
  })

  it('reporta un JSON de mapeo inválido', () => {
    const result = service.resolveMapping(workbook([]), '{')

    expect(result.mapping).toEqual({})
    expect(result.errors).toEqual([
      'EXTERNAL_DATA_COLUMN_MAP no contiene JSON válido',
    ])
  })
})
