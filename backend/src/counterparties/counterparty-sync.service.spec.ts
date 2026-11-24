import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../audit/audit.service.js'
import { CategoriesService } from '../categories/categories.service.js'
import { uuidFromDocument } from '../external-data/colocadores-workbook.util.js'
import { ExternalDataService } from '../external-data/external-data.service.js'
import type { ExternalAnnualRow } from '../external-data/types.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { CounterpartySyncService } from './counterparty-sync.service.js'

function row(
  overrides: Partial<ExternalAnnualRow> = {},
): ExternalAnnualRow {
  return {
    id: 'row-1',
    code: 'row-1',
    nit: '1234567',
    businessName: 'Contraparte de prueba',
    status: 'ACTIVE',
    requiresSemiannualFollowUp: true,
    filingDate: '2026-01-15',
    filingYear: 2026,
    dueDiligenceType: null,
    observations: null,
    updatedThisYear: true,
    annualStatus: 'UPDATED_THIS_YEAR',
    sourceFileName: 'libro.xlsx',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('CounterpartySyncService', () => {
  let prisma: {
    counterparty: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
    subprocess: { upsert: ReturnType<typeof vi.fn> }
  }
  let externalData: {
    refresh: ReturnType<typeof vi.fn>
    getAllRows: ReturnType<typeof vi.fn>
    getAllColocadoresRows: ReturnType<typeof vi.fn>
  }
  let categories: { resolveId: ReturnType<typeof vi.fn> }
  let audit: { record: ReturnType<typeof vi.fn> }
  let service: CounterpartySyncService

  beforeEach(() => {
    prisma = {
      counterparty: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      subprocess: {
        upsert: vi.fn().mockResolvedValue({ id: 'subprocess-1' }),
      },
    }
    externalData = {
      refresh: vi.fn().mockResolvedValue({ rowCount: 3 }),
      getAllRows: vi.fn(),
      getAllColocadoresRows: vi.fn(),
    }
    categories = { resolveId: vi.fn().mockResolvedValue('category-1') }
    audit = { record: vi.fn() }
    service = new CounterpartySyncService(
      prisma as unknown as PrismaService,
      externalData as unknown as ExternalDataService,
      categories as unknown as CategoriesService,
      audit as unknown as AuditService,
    )
  })

  it('importa de FR-SG-79 solo las filas marcadas para seguimiento', async () => {
    externalData.getAllRows.mockReturnValue([
      row({ id: 'a', nit: '1234567' }),
      row({
        id: 'b',
        nit: '7654321',
        requiresSemiannualFollowUp: false,
      }),
    ])
    prisma.counterparty.createMany.mockResolvedValue({ count: 1 })

    const result = await service.syncArriendos('user-1')

    expect(externalData.refresh).toHaveBeenCalledWith(
      'sincronización de contrapartes de Arriendos',
    )
    expect(prisma.counterparty.createMany).toHaveBeenCalledTimes(1)
    const data = prisma.counterparty.createMany.mock.calls[0][0].data
    expect(data).toHaveLength(1)
    expect(data[0].nit).toBe('1234567')
    expect(data[0]).not.toHaveProperty('id')
    expect(result).toEqual({
      sourceRows: 3,
      followUpRows: 1,
      created: 1,
      alreadyExisting: 0,
      skippedInvalid: 0,
    })
  })

  it('sincroniza Colocadores desde FR-SG-81 conservando el ID del workbook', async () => {
    externalData.getAllColocadoresRows.mockReturnValue([
      row({ id: 'a', nit: '1234567', requiresSemiannualFollowUp: true }),
      row({
        id: 'b',
        nit: '7654321',
        requiresSemiannualFollowUp: false,
        status: 'INACTIVE',
      }),
      row({ id: 'c', nit: null, requiresSemiannualFollowUp: null }),
    ])
    prisma.counterparty.createMany.mockResolvedValue({ count: 2 })

    const result = await service.syncColocadores('user-1')

    expect(externalData.refresh).toHaveBeenCalledWith(
      'sincronización de contrapartes de Colocadores',
      'colocadores',
    )
    expect(categories.resolveId).toHaveBeenCalledWith(
      'COLOCADORES_INDEPENDIENTES',
    )
    const data = prisma.counterparty.createMany.mock.calls[0][0].data
    expect(data).toHaveLength(2)
    expect(data[0].id).toBe(uuidFromDocument('1234567'))
    expect(data[1].id).toBe(uuidFromDocument('7654321'))
    expect(data[1].status).toBe('ARCHIVED')
    expect(result).toEqual({
      sourceRows: 3,
      followUpRows: 2,
      created: 2,
      alreadyExisting: 0,
      skippedInvalid: 0,
    })
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SYNC_COLOCADORES_COUNTERPARTIES',
      }),
    )
  })
})
