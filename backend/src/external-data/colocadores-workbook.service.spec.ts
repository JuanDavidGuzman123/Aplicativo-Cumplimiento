import { RiskDecision } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ColocadoresWorkbookService } from './colocadores-workbook.service.js'
import type { ExternalWorkbookRow } from './types.js'

const documentId = '1110579763'
const businessName = 'Juan Carlos Cortes Ruiz'
const registrationDate = '2024-01-09'
const observations = 'Comparendos e infracciones de transito'
const now = new Date('2026-11-23T12:00:00.000Z')

const headers = [
  'Numero de documento',
  'Tipo de Documento',
  'Nombres y Apellidos',
  'Fecha Debida Diligencia',
  'Categoria',
  'Numero De Firma',
  'Dirección',
  'Municipio',
  'Correo electronico',
  'Telefono',
  'Criterios De Evaluacion',
  'Excepciones\nSi / No',
  'Seguimiento Si/No',
  'Observaciones',
  'Riesgo Jurisdiccional',
]

const rowValues = [
  documentId,
  '',
  businessName,
  registrationDate,
  'GGPLUS TIPO A',
  '1',
  'Carrera 3 sur',
  'Ibague',
  'correo@example.com',
  '3172278389',
  'L1',
  'No',
  'Si',
  observations,
  'Critico',
]

const config = {
  colocadoresReadConfigured: true,
  colocadoresWorkbookPath: 'FR-SG-81.xlsx',
  colocadoresWorksheetName: 'FR-SG-81',
}

function createService(values = rowValues) {
  const reader = {
    readWorkbook: vi.fn(async () => ({
      fileName: 'FR-SG-81.xlsx',
      sourceName: 'Hoja: FR-SG-81',
      sourceUrl: null,
      tableOrWorksheet: 'Hoja: FR-SG-81',
      headers: headers.map((value) => ({ value, label: value })),
      rows: [{ rowNumber: 4, values } as ExternalWorkbookRow],
      version: 'version',
      lastModifiedDateTime: now.toISOString(),
    })),
  }
  const writer = {
    prepare: vi.fn(async () => ({
      sourceRows: 1955,
      followUpRows: 1,
      created: 0,
      alreadyExisting: 1,
      skippedInvalid: 0,
    })),
    writeFields: vi.fn(async () => undefined),
  }

  return {
    service: new ColocadoresWorkbookService(
      config as never,
      reader as never,
      writer as never,
    ),
    writer,
  }
}

describe('ColocadoresWorkbookService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  it('lee solo las filas con seguimiento desde el workbook', async () => {
    const { service } = createService()

    const result = await service.list({ page: 1, pageSize: 10 } as never)

    expect(result.meta.total).toBe(1)
    expect(result.data[0]).toMatchObject({
      nit: documentId,
      businessName,
      status: 'ACTIVE',
      observations,
    })
  })

  it('solo cambia Seguimiento Si/No en el Excel y guarda la evaluación en memoria', async () => {
    const { service, writer } = createService()
    const listed = await service.list({ page: 1, pageSize: 10 } as never)
    const id = listed.data[0].id

    const detail = await service.evaluateRisk(
      id,
      {
        decision: RiskDecision.CONTINUE,
        evaluatedAt: '2026-11-23',
        notes: 'Nueva observación',
      } as never,
      'actor-id',
    )

    expect(writer.writeFields).toHaveBeenCalledTimes(1)
    expect(writer.writeFields).toHaveBeenCalledWith(
      'FR-SG-81.xlsx',
      'FR-SG-81',
      id,
      { followUp: 'Si' },
    )
    expect(detail.observations).toBe('Nueva observación')
    expect(detail.riskEvaluations[0].decision).toBe(RiskDecision.CONTINUE)
  })

  it('archiva escribiendo Seguimiento No en el workbook', async () => {
    const { service, writer } = createService()
    const listed = await service.list({ page: 1, pageSize: 10 } as never)
    const id = listed.data[0].id

    const detail = await service.evaluateRisk(
      id,
      {
        decision: RiskDecision.ARCHIVE,
        evaluatedAt: '2026-11-23',
        notes: 'Archivada por prueba',
      } as never,
      'actor-id',
    )

    expect(writer.writeFields).toHaveBeenCalledWith(
      'FR-SG-81.xlsx',
      'FR-SG-81',
      id,
      { followUp: 'No' },
    )
    expect(detail.status).toBe('ARCHIVED')
  })

  it('mantiene visibles las archivadas cuando Seguimiento es No', async () => {
    const archivedValues = [...rowValues]
    archivedValues[12] = 'No'
    const { service } = createService(archivedValues)

    const result = await service.list({ page: 1, pageSize: 10 } as never)

    expect(result.meta.total).toBe(1)
    expect(result.data[0].status).toBe('ARCHIVED')
  })

  it('prepara el libro sin modificarlo', async () => {
    const { service, writer } = createService()

    const result = await service.prepareWorkbook()

    expect(writer.prepare).toHaveBeenCalledWith(
      'FR-SG-81.xlsx',
      'FR-SG-81',
    )
    expect(result).toMatchObject({ created: 0, followUpRows: 1 })
  })
})
