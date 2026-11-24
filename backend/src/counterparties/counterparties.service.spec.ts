import {
  ConflictException,
} from '@nestjs/common'
import {
  CounterpartyStatus,
  RiskDecision,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../audit/audit.service.js'
import {
  addMonths,
  getBusinessToday,
  toDateOnly,
} from '../common/utils/dates.js'
import type { ArriendosWorkbookService } from '../external-data/arriendos-workbook.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { CounterpartiesService } from './counterparties.service.js'

type PrismaMock = {
  $transaction: ReturnType<typeof vi.fn>
  counterparty: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  riskEvaluation: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
}

function detailRow(overrides: Record<string, unknown> = {}) {
  const today = getBusinessToday()

  return {
    id: 'counterparty-1',
    nit: '9001234567',
    businessName: 'Empresa de prueba',
    status: CounterpartyStatus.ACTIVE,
    registrationDate: today,
    lastFollowUpDate: today,
    nextFollowUpDate: addMonths(today, 6),
    subprocess: {
      id: 'subprocess-1',
      name: 'Debida diligencia',
      active: true,
    },
    observations: null,
    archivedAt: null,
    archiveReason: null,
    archivedBy: null,
    reactivatedAt: null,
    reactivationReason: null,
    reactivatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { followUps: 0 },
    riskEvaluations: [],
    ...overrides,
  }
}

describe('CounterpartiesService.evaluateRisk', () => {
  let prisma: PrismaMock
  let audit: { record: ReturnType<typeof vi.fn> }
  let arriendos: { writeFollowUp: ReturnType<typeof vi.fn> }
  let service: CounterpartiesService
  const today = getBusinessToday()
  const evaluatedAt = toDateOnly(today) ?? ''

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((calls: Promise<unknown>[]) => Promise.all(calls)),
      counterparty: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      riskEvaluation: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    }
    audit = { record: vi.fn() }
    arriendos = { writeFollowUp: vi.fn() }
    service = new CounterpartiesService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      arriendos as unknown as ArriendosWorkbookService,
    )
  })

  it('keeps the counterparty active and schedules the next follow-up six months later', async () => {
    const nextFollowUpDate = addMonths(today, 6)

    prisma.counterparty.findUnique
      .mockResolvedValueOnce(detailRow())
      .mockResolvedValueOnce(
        detailRow({
          status: CounterpartyStatus.ACTIVE,
          lastFollowUpDate: today,
          nextFollowUpDate,
        }),
      )
    prisma.riskEvaluation.findFirst.mockResolvedValue(null)

    const result = await service.evaluateRisk(
      'counterparty-1',
      {
        decision: RiskDecision.CONTINUE,
        evaluatedAt,
      },
      'user-1',
    )

    expect(prisma.counterparty.update).toHaveBeenCalledWith({
      where: { id: 'counterparty-1' },
      data: {
        status: CounterpartyStatus.ACTIVE,
        lastFollowUpDate: today,
        nextFollowUpDate,
      },
    })
    expect(prisma.riskEvaluation.create).toHaveBeenCalledWith({
      data: {
        counterpartyId: 'counterparty-1',
        decision: RiskDecision.CONTINUE,
        evaluatedAt: today,
        nextFollowUpDate,
        notes: null,
        createdById: 'user-1',
      },
    })
    expect(result.status).toBe(CounterpartyStatus.ACTIVE)
    expect(arriendos.writeFollowUp).not.toHaveBeenCalled()
  })

  it('escribe Si en FR-SG-79 al continuar una contraparte de Arriendos', async () => {
    prisma.counterparty.findUnique
      .mockResolvedValueOnce(
        detailRow({ category: { key: 'ARRIENDOS' } }),
      )
      .mockResolvedValueOnce(
        detailRow({ category: { key: 'ARRIENDOS' } }),
      )
    prisma.riskEvaluation.findFirst.mockResolvedValue(null)
    arriendos.writeFollowUp.mockResolvedValue({
      followUp: 'Si',
      observations: '',
    })

    await service.evaluateRisk(
      'counterparty-1',
      {
        decision: RiskDecision.CONTINUE,
        evaluatedAt,
        notes: 'Seguimiento semestral',
      },
      'user-1',
    )

    expect(arriendos.writeFollowUp).toHaveBeenCalledWith(
      '9001234567',
      'Si',
      'Seguimiento semestral',
    )
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('restaura FR-SG-79 si falla la transacción de base de datos', async () => {
    prisma.counterparty.findUnique.mockResolvedValueOnce(
      detailRow({ category: { key: 'ARRIENDOS' } }),
    )
    prisma.riskEvaluation.findFirst.mockResolvedValue(null)
    prisma.$transaction.mockRejectedValueOnce(new Error('fallo db'))
    arriendos.writeFollowUp
      .mockResolvedValueOnce({
        followUp: 'No',
        observations: 'Observación anterior',
      })
      .mockResolvedValueOnce({
        followUp: 'No',
        observations: 'Observación anterior',
      })

    await expect(
      service.evaluateRisk(
        'counterparty-1',
        {
          decision: RiskDecision.CONTINUE,
          evaluatedAt,
          notes: 'Nueva observación',
        },
        'user-1',
      ),
    ).rejects.toThrow('fallo db')

    expect(arriendos.writeFollowUp).toHaveBeenNthCalledWith(
      1,
      '9001234567',
      'Si',
      'Nueva observación',
    )
    expect(arriendos.writeFollowUp).toHaveBeenNthCalledWith(
      2,
      '9001234567',
      'No',
      'Observación anterior',
    )
  })

  it('archives the counterparty when the risk decision is negative', async () => {
    prisma.counterparty.findUnique
      .mockResolvedValueOnce(detailRow())
      .mockResolvedValueOnce(
        detailRow({
          status: CounterpartyStatus.ARCHIVED,
          archivedAt: new Date(),
          archiveReason: 'Ya no presenta riesgo',
        }),
      )
    prisma.riskEvaluation.findFirst.mockResolvedValue(null)

    const result = await service.evaluateRisk(
      'counterparty-1',
      {
        decision: RiskDecision.ARCHIVE,
        evaluatedAt,
        notes: 'Ya no presenta riesgo',
      },
      'user-1',
    )

    expect(prisma.counterparty.update).toHaveBeenCalledWith({
      where: { id: 'counterparty-1' },
      data: expect.objectContaining({
        status: CounterpartyStatus.ARCHIVED,
        lastFollowUpDate: today,
        archiveReason: 'Ya no presenta riesgo',
      }),
    })
    expect(prisma.riskEvaluation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        decision: RiskDecision.ARCHIVE,
        nextFollowUpDate: null,
        notes: 'Ya no presenta riesgo',
      }),
    })
    expect(result.status).toBe(CounterpartyStatus.ARCHIVED)
  })

  it('rejects a duplicated decision for the same evaluation date', async () => {
    prisma.counterparty.findUnique.mockResolvedValueOnce(detailRow())
    prisma.riskEvaluation.findFirst.mockResolvedValue({ id: 'existing' })

    await expect(
      service.evaluateRisk(
        'counterparty-1',
        {
          decision: RiskDecision.CONTINUE,
          evaluatedAt,
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.counterparty.update).not.toHaveBeenCalled()
  })

  it('escribe Si en FR-SG-79 al reactivar una contraparte de Arriendos', async () => {
    prisma.counterparty.findUnique
      .mockResolvedValueOnce(
        detailRow({
          status: CounterpartyStatus.ARCHIVED,
          category: { key: 'ARRIENDOS' },
        }),
      )
      .mockResolvedValueOnce(
        detailRow({
          status: CounterpartyStatus.ACTIVE,
          category: { key: 'ARRIENDOS' },
        }),
      )
    arriendos.writeFollowUp.mockResolvedValue({
      followUp: 'No',
      observations: 'Archivada',
    })

    await service.reactivate(
      'counterparty-1',
      { reason: 'Se reactiva' },
      'user-1',
    )

    expect(arriendos.writeFollowUp).toHaveBeenCalledWith(
      '9001234567',
      'Si',
      'Se reactiva',
    )
    expect(prisma.$transaction).toHaveBeenCalled()
  })
})

describe('CounterpartiesService.findAll', () => {
  it('filters counterparties by category key', async () => {
    const prisma = {
      $transaction: vi.fn((calls: Promise<unknown>[]) =>
        Promise.all(calls),
      ),
      counterparty: {
        findMany: vi.fn().mockResolvedValue([
          detailRow({
            category: {
              id: 'colocadores',
              key: 'COLOCADORES_INDEPENDIENTES',
              name: 'Colocadores independientes',
            },
          }),
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const service = new CounterpartiesService(
      prisma as unknown as PrismaService,
      { record: vi.fn() } as unknown as AuditService,
      { writeFollowUp: vi.fn() } as unknown as ArriendosWorkbookService,
    )

    await service.findAll({
      category: 'COLOCADORES_INDEPENDIENTES',
      status: CounterpartyStatus.ACTIVE,
      page: 1,
      pageSize: 10,
    })

    expect(prisma.counterparty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { key: 'COLOCADORES_INDEPENDIENTES' },
        }),
      }),
    )
  })
})
