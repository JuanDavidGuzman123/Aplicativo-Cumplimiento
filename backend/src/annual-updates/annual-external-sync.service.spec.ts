import { AnnualStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExternalAnnualRow } from '../external-data/types.js'
import { AnnualExternalSyncService } from './annual-external-sync.service.js'

function makeRow(
  overrides: Partial<ExternalAnnualRow> = {},
): ExternalAnnualRow {
  return {
    id: 'external-PROV-1',
    code: 'PROV-1',
    nit: '900123456',
    businessName: 'Proveedor Uno',
    status: 'ACTIVE',
    requiresSemiannualFollowUp: null,
    filingDate: '2025-11-25',
    filingYear: 2025,
    dueDiligenceType: 'Básica',
    observations: 'Observación',
    updatedThisYear: false,
    annualStatus: 'UPDATED_THIS_YEAR',
    sourceFileName: 'FR-SG-83.xlsx',
    createdAt: '2025-11-25T00:00:00.000Z',
    updatedAt: '2025-11-25T00:00:00.000Z',
    ...overrides,
  }
}

function matchingExisting(row: ExternalAnnualRow) {
  return {
    code: row.code,
    codeNormalized: row.code,
    businessName: row.businessName,
    status: AnnualStatus.ACTIVE,
    requiresSemiannualFollowUp: row.requiresSemiannualFollowUp,
    filingDate: new Date(`${row.filingDate}T00:00:00.000Z`),
    filingYear: row.filingYear,
    dueDiligenceType: row.dueDiligenceType,
    observations: row.observations,
    sourceFileName: row.sourceFileName,
  }
}

function createService(
  rows: ExternalAnnualRow[],
  existing: ReturnType<typeof matchingExisting>[] = [],
) {
  const externalData = {
    refresh: vi.fn().mockResolvedValue({
      rowCount: rows.length,
      lastError: null,
    }),
    getAllRows: vi.fn().mockReturnValue(rows),
  }
  const annualCounterparty = {
    findMany: vi.fn().mockResolvedValue(existing),
    upsert: vi.fn().mockResolvedValue({}),
  }
  const prisma = {
    annualCounterparty,
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ annualCounterparty }),
    ),
  }
  const audit = {
    record: vi.fn().mockResolvedValue(undefined),
  }

  return {
    service: new AnnualExternalSyncService(
      prisma as never,
      externalData as never,
      audit as never,
    ),
    externalData,
    annualCounterparty,
    audit,
  }
}

describe('AnnualExternalSyncService', () => {
  let row: ExternalAnnualRow

  beforeEach(() => {
    row = makeRow()
  })

  it('crea contrapartes anuales desde el libro externo y omite filas inválidas', async () => {
    const { service, externalData, annualCounterparty, audit } =
      createService([row, makeRow({ code: '   ', businessName: '' })])

    const result = await service.sync('proveedores')

    expect(externalData.refresh).toHaveBeenCalledWith(
      'sincronización anual de proveedores',
      'proveedores',
    )
    expect(annualCounterparty.upsert).toHaveBeenCalledTimes(1)
    expect(annualCounterparty.upsert).toHaveBeenCalledWith({
      where: {
        source_codeNormalized: {
          source: 'proveedores',
          codeNormalized: 'PROV-1',
        },
      },
      create: expect.objectContaining({
        source: 'proveedores',
        code: 'PROV-1',
        businessName: 'Proveedor Uno',
        status: AnnualStatus.ACTIVE,
        sourceFileName: 'FR-SG-83.xlsx',
      }),
      update: expect.objectContaining({ code: 'PROV-1' }),
    })
    expect(result).toMatchObject({
      source: 'proveedores',
      sourceRows: 2,
      created: 1,
      updated: 0,
      unchanged: 0,
      skipped: 1,
      error: null,
    })
    expect(audit.record).toHaveBeenCalledWith({
      action: 'ANNUAL_UPDATES_EXTERNAL_SYNC',
      entity: 'AnnualCounterparty',
      details: result,
    })
  })

  it('no vuelve a escribir filas iguales', async () => {
    const { service, annualCounterparty } = createService(
      [row],
      [matchingExisting(row)],
    )

    const result = await service.sync('clientes')

    expect(annualCounterparty.upsert).not.toHaveBeenCalled()
    expect(result.unchanged).toBe(1)
    expect(result.created).toBe(0)
  })

  it('actualiza filas que cambiaron en el libro externo', async () => {
    const existing = {
      ...matchingExisting(row),
      businessName: 'Nombre anterior',
    }
    const { service, annualCounterparty } = createService(
      [row],
      [existing],
    )

    const result = await service.sync('proveedores')

    expect(annualCounterparty.upsert).toHaveBeenCalledTimes(1)
    expect(result.updated).toBe(1)
    expect(result.created).toBe(0)
  })

  it('omite la sincronización cuando el libro no tiene filas', async () => {
    const { service, annualCounterparty } = createService([])

    const result = await service.sync('proveedores')

    expect(annualCounterparty.upsert).not.toHaveBeenCalled()
    expect(result.sourceRows).toBe(0)
    expect(result.error).toBe('El libro externo no tiene filas')
  })
})
