import ExcelJS from 'exceljs'
import { AnnualStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNUAL_DAY_IN_MS,
  minimumAnnualFilingDate,
} from './annual-dates.js'
import { AnnualNotificationsService } from '../annual-notifications/annual-notifications.service.js'
import { AuditService } from '../audit/audit.service.js'
import {
  getBusinessToday,
  parseDateOnly,
} from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { AnnualUpdatesService } from './annual-updates.service.js'

const today = getBusinessToday()
const currentYear = today.getUTCFullYear()
const thisYearDate = `${currentYear}-03-15`
const previousYearDate = `${currentYear - 1}-03-15`

function filingDateForDue(days: number): Date {
  const due = new Date(today.getTime() + days * ANNUAL_DAY_IN_MS)

  return new Date(
    Date.UTC(
      due.getUTCFullYear() - 1,
      due.getUTCMonth(),
      due.getUTCDate(),
    ),
  )
}

async function workbookFile(
  rows: (string | number | null)[][],
): Promise<{
  originalname: string
  buffer: Buffer
  size: number
  mimetype: string
}> {
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

  for (const row of rows) {
    sheet.addRow(row)
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

  return {
    originalname: 'base-anual.xlsx',
    buffer,
    size: buffer.length,
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}

type PrismaMock = {
  annualCounterparty: {
    count: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

function createPrismaMock(): PrismaMock {
  return {
    annualCounterparty: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  }
}

function createService(prisma: PrismaMock) {
  const audit = {
    record: vi.fn().mockResolvedValue(undefined),
  }
  const annualNotifications = {
    generateDaily: vi
      .fn()
      .mockResolvedValue({ evaluated: 0, created: 0 }),
  }

  return {
    service: new AnnualUpdatesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      annualNotifications as unknown as AnnualNotificationsService,
    ),
    audit,
    annualNotifications,
  }
}

const existingBeta = {
  id: 'existing',
  codeNormalized: 'PDV-002',
  businessName: 'Beta SAS',
  status: AnnualStatus.INACTIVE,
  requiresSemiannualFollowUp: false,
  filingDate: null,
  filingYear: currentYear - 1,
  dueDiligenceType: 'Básica',
  observations: null,
}

describe('AnnualUpdatesService', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = createPrismaMock()
  })

  it('calculates the annual summary and keeps inactive rows out of pending active', async () => {
    prisma.annualCounterparty.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(4)

    const { service } = createService(prisma)
    const summary = await service.getSummary()

    expect(summary).toMatchObject({
      currentYear,
      totals: {
        total: 10,
        active: 7,
        inactive: 3,
      },
      annual: {
        updatedThisYear: 5,
        active: {
          total: 7,
          updatedThisYear: 4,
          pendingUpdate: 3,
          withoutDate: 1,
        },
        inactive: {
          total: 3,
          updatedThisYear: 1,
          pendingUpdate: 0,
          withoutDate: 2,
        },
      },
      semiannual: {
        activeWithFollowUp: 5,
        inactiveWithFollowUp: 1,
        totalWithFollowUp: 6,
      },
    })
  })

  it('previews new, unchanged and invalid rows without writing', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([
      existingBeta,
    ])

    const { service } = createService(prisma)
    const preview = await service.preview(
      await workbookFile([
        [
          'PDV-001',
          'Alfa SAS',
          'A',
          thisYearDate,
          currentYear,
          'Básica',
          'Sí',
          'Sin novedad',
        ],
        [
          'PDV-002',
          'Beta SAS',
          'I',
          null,
          currentYear - 1,
          'Básica',
          'No',
          null,
        ],
        [
          'PDV-003',
          'Gamma SAS',
          'X',
          null,
          currentYear,
          null,
          'No',
          null,
        ],
        [
          'PDV-001',
          'Alfa repetida',
          'A',
          thisYearDate,
          currentYear,
          'Básica',
          'No',
          null,
        ],
      ]),
    )

    expect(preview.summary).toMatchObject({
      totalRows: 4,
      validRows: 2,
      newRows: 1,
      updatedRows: 0,
      unchangedRows: 1,
      ignoredRows: 1,
      errorRows: 1,
      activeRows: 1,
      inactiveRows: 1,
      activeUpdatedThisYear: 1,
      activePendingUpdate: 0,
      inactiveUpdatedThisYear: 0,
      inactivePendingUpdate: 1,
      semiannualFollowUpRows: 1,
      canConfirm: true,
    })
    expect(preview.rows[0]).toMatchObject({
      filingDate: thisYearDate,
      filingYear: currentYear,
      dueDiligenceType: 'Básica',
      observations: 'Sin novedad',
    })
    expect(preview.rows[1].action).toBe('UNCHANGED')
    expect(preview.rows[2].errors[0]).toContain('no es válido')
    expect(preview.rows[3]).toMatchObject({
      action: 'IGNORED',
      errors: [],
    })
  })

  it('keeps the most recent row when a code repeats', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([])

    const { service } = createService(prisma)
    const preview = await service.preview(
      await workbookFile([
        [
          'PDV-010',
          'Arrendador antiguo',
          'A',
          previousYearDate,
          currentYear - 1,
          null,
          null,
          null,
        ],
        [
          'PDV-010',
          'Arrendador reciente',
          'A',
          thisYearDate,
          currentYear,
          null,
          null,
          null,
        ],
      ]),
    )

    expect(preview.summary).toMatchObject({
      totalRows: 2,
      validRows: 1,
      newRows: 1,
      ignoredRows: 1,
      errorRows: 0,
    })
    expect(preview.rows[0]).toMatchObject({
      action: 'IGNORED',
      errors: [],
    })
    expect(preview.rows[1]).toMatchObject({
      action: 'NEW',
      businessName: 'Arrendador reciente',
      filingDate: thisYearDate,
      errors: [],
    })
  })

  it('treats N/A dates and years as missing values', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([])

    const { service } = createService(prisma)
    const preview = await service.preview(
      await workbookFile([
        [
          'PDV-020',
          'Sin fecha SAS',
          'A',
          'N/A',
          'N/A',
          null,
          null,
          null,
        ],
      ]),
    )

    expect(preview.rows[0]).toMatchObject({
      action: 'NEW',
      filingDate: null,
      filingYear: null,
      errors: [],
    })
    expect(preview.summary).toMatchObject({
      validRows: 1,
      errorRows: 0,
      withoutDateRows: 1,
    })
  })

  it('keeps blank follow-up values empty and compares them with existing empty values', async () => {
    const observations = 'Revisar con el área\nsiguiente línea'
    prisma.annualCounterparty.findMany.mockResolvedValue([
      {
        id: 'existing-delta',
        codeNormalized: 'PDV-004',
        businessName: 'Delta SAS',
        status: AnnualStatus.ACTIVE,
        requiresSemiannualFollowUp: null,
        filingDate: parseDateOnly(thisYearDate),
        filingYear: currentYear,
        dueDiligenceType: 'Básica',
        observations,
      },
    ])

    const { service } = createService(prisma)
    const preview = await service.preview(
      await workbookFile([
        [
          'PDV-004',
          'Delta SAS',
          'A',
          thisYearDate,
          currentYear,
          'Básica',
          null,
          observations,
        ],
      ]),
    )

    expect(preview.rows[0]).toMatchObject({
      requiresSemiannualFollowUp: null,
      action: 'UNCHANGED',
      observations,
      errors: [],
    })
    expect(preview.rows[0].warnings).not.toContain(
      'Sin dato de seguimiento; se asumió No',
    )
    expect(preview.summary.semiannualFollowUpRows).toBe(0)
  })

  it('confirms valid rows idempotently and records audit', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([
      existingBeta,
    ])

    const upsert = vi.fn().mockResolvedValue({})
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          annualCounterparty: { upsert },
        }),
    )

    const { service, audit, annualNotifications } =
      createService(prisma)
    const file = await workbookFile([
      [
        'PDV-001',
        'Alfa SAS',
        'A',
        thisYearDate,
        currentYear,
        'Básica',
        'Sí',
        'Sin novedad',
      ],
      [
        'PDV-002',
        'Beta SAS',
        'I',
        null,
        currentYear - 1,
        'Básica',
        'No',
        null,
      ],
    ])
    const result = await service.confirmImport(
      file,
      undefined,
      'user-1',
    )

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith({
      where: {
        source_codeNormalized: {
          source: 'arriendos',
          codeNormalized: 'PDV-001',
        },
      },
      create: expect.objectContaining({
        source: 'arriendos',
        code: 'PDV-001',
        codeNormalized: 'PDV-001',
        businessName: 'Alfa SAS',
        status: AnnualStatus.ACTIVE,
        requiresSemiannualFollowUp: true,
        filingDate: parseDateOnly(thisYearDate),
        filingYear: currentYear,
        dueDiligenceType: 'Básica',
        observations: 'Sin novedad',
        sourceFileName: 'base-anual.xlsx',
      }),
      update: expect.objectContaining({
        code: 'PDV-001',
      }),
    })
    expect(result.summary).toMatchObject({
      created: 1,
      updated: 0,
      unchanged: 1,
      skipped: 0,
    })
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'ANNUAL_UPDATES_IMPORTED',
        entity: 'AnnualCounterparty',
      }),
    )
    expect(annualNotifications.generateDaily).toHaveBeenCalledTimes(
      1,
    )
  })

  it('filters pending active rows outside the current year', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([
      {
        id: 'row-1',
        code: 'PDV-001',
        businessName: 'Alfa SAS',
        status: AnnualStatus.ACTIVE,
        requiresSemiannualFollowUp: false,
        filingDate: parseDateOnly(previousYearDate),
        filingYear: currentYear - 1,
        dueDiligenceType: 'Básica',
        observations: 'Pendiente',
        sourceFileName: 'base-anual.xlsx',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    prisma.annualCounterparty.count.mockResolvedValue(1)

    const { service } = createService(prisma)
    const result = await service.findAll({
      page: 1,
      pageSize: 20,
      annualStatus: 'PENDING',
    })

    expect(result.meta.total).toBe(1)
    expect(result.data[0]).toMatchObject({
      annualStatus: 'PENDING',
      filingDate: previousYearDate,
      filingYear: currentYear - 1,
      dueDiligenceType: 'Básica',
      observations: 'Pendiente',
    })
    expect(prisma.annualCounterparty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              source: 'arriendos',
            },
            {
              source: 'arriendos',
              status: AnnualStatus.ACTIVE,
              OR: [
                { filingYear: { lt: currentYear } },
                { filingYear: { gt: currentYear } },
                { filingYear: null, filingDate: null },
                {
                  filingYear: null,
                  filingDate: {
                    lt: new Date(
                      Date.UTC(currentYear, 0, 1),
                    ),
                  },
                },
                {
                  filingYear: null,
                  filingDate: {
                    gte: new Date(
                      Date.UTC(currentYear + 1, 0, 1),
                    ),
                  },
                },
              ],
            },
          ],
        },
      }),
    )
  })

  it('lists due and upcoming annual updates and summarizes them', async () => {
    const makeRow = (
      id: string,
      code: string,
      filingDate: Date | null,
    ) => ({
      id,
      code,
      businessName: `Empresa ${code}`,
      status: AnnualStatus.ACTIVE,
      requiresSemiannualFollowUp: null,
      filingDate,
      filingYear: filingDate?.getUTCFullYear() ?? null,
      dueDiligenceType: 'Básica',
      observations: null,
      sourceFileName: 'base-anual.xlsx',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    prisma.annualCounterparty.findMany.mockResolvedValue([
      makeRow('row-1', 'PDV-001', filingDateForDue(3)),
      makeRow('row-2', 'PDV-002', filingDateForDue(20)),
      makeRow('row-3', 'PDV-003', filingDateForDue(-2)),
      makeRow('row-4', 'PDV-004', null),
      makeRow(
        'row-5',
        'PDV-005',
        new Date(Date.UTC(currentYear - 2, 5, 15)),
      ),
    ])

    const { service } = createService(prisma)
    const result = await service.getUpdatesDue({
      page: 1,
      pageSize: 10,
    })

    expect(prisma.annualCounterparty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: 'arriendos',
          status: AnnualStatus.ACTIVE,
          filingDate: {
            gte: minimumAnnualFilingDate(currentYear),
          },
        },
      }),
    )
    expect(result.meta.total).toBe(2)
    expect(result.data.map((row) => row.code)).toEqual([
      'PDV-003',
      'PDV-001',
    ])
    expect(result.data[1]).toMatchObject({
      daysUntilDue: 3,
      situation: 'DUE_SOON',
    })
    expect(result.summary).toEqual({
      needsUpdate: 1,
      overdue: 1,
      dueToday: 0,
      upcoming: 1,
      withoutDate: 0,
    })
  })

  it('returns mapping errors without blocking the mapping UI', async () => {
    const { service } = createService(prisma)
    const file = await workbookFile([
      [
        'PDV-001',
        'Alfa SAS',
        'A',
        thisYearDate,
        currentYear,
        'Básica',
        'Sí',
        'Sin novedad',
      ],
    ])

    const preview = await service.preview(
      file,
      JSON.stringify({ code: null }),
    )

    expect(preview.rows).toHaveLength(0)
    expect(preview.summary.canConfirm).toBe(false)
    expect(preview.mappingErrors[0]).toContain(
      'código de punto de venta',
    )
  })
})
