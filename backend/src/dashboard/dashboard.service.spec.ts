import {
  CounterpartyStatus,
  FollowUpStatus,
  type Prisma,
} from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDateOnly } from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { DashboardService } from './dashboard.service.js'

const today = parseDateOnly('2026-11-06')

function createSummaryPrismaMock() {
  const counterpartyCount = vi.fn(
    ({ where }: { where: Prisma.CounterpartyWhereInput }) => {
      if (where.status === CounterpartyStatus.ARCHIVED) {
        return Promise.resolve(2)
      }

      const dateFilter = where.nextFollowUpDate

      if (dateFilter === null) {
        return Promise.resolve(4)
      }

      if (dateFilter && typeof dateFilter === 'object') {
        if ('lt' in dateFilter) {
          return Promise.resolve(3)
        }

        if ('gte' in dateFilter && 'lte' in dateFilter) {
          const start = dateFilter.gte as Date
          return Promise.resolve(
            start.getTime() === today.getTime() ? 5 : 6,
          )
        }

        if ('gt' in dateFilter) {
          return Promise.resolve(7)
        }
      }

      return Promise.resolve(25)
    },
  )

  const followUpCount = vi.fn(
    ({ where }: { where: Prisma.FollowUpWhereInput }) =>
      Promise.resolve(
        where.status === FollowUpStatus.DRAFT ? 8 : 11,
      ),
  )

  return {
    counterparty: {
      count: counterpartyCount,
      findMany: vi.fn(),
    },
    followUp: { count: followUpCount },
    subprocess: {
      count: vi.fn().mockResolvedValue(4),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  }
}

function createAttentionPrismaMock() {
  const rows = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      nit: '900123456',
      businessName: 'Contraparte vencida',
      lastFollowUpDate: parseDateOnly('2026-05-01'),
      nextFollowUpDate: parseDateOnly('2026-11-04'),
      subprocess: {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Subproceso uno',
        active: true,
      },
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      nit: '900654321',
      businessName: 'Contraparte pendiente',
      lastFollowUpDate: null,
      nextFollowUpDate: parseDateOnly('2026-11-10'),
      subprocess: {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Subproceso uno',
        active: true,
      },
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      nit: '900000001',
      businessName: 'Contraparte sin programar',
      lastFollowUpDate: null,
      nextFollowUpDate: null,
      subprocess: {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Subproceso dos',
        active: true,
      },
    },
  ]

  return {
    counterparty: {
      count: vi.fn().mockResolvedValue(rows.length),
      findMany: vi.fn().mockResolvedValue(rows),
    },
    followUp: { count: vi.fn() },
    subprocess: { count: vi.fn() },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  }
}

describe('DashboardService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-06T15:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds the dashboard summary with all calendar ranges', async () => {
    const prisma = createSummaryPrismaMock()
    const service = new DashboardService(
      prisma as unknown as PrismaService,
    )

    const summary = await service.getSummary()

    expect(summary).toMatchObject({
      businessDate: '2026-11-06',
      generatedAt: '2026-11-06T15:00:00.000Z',
      counterparties: { active: 25, archived: 2 },
      calendar: {
        overdue: 3,
        pending: 5,
        upcoming: 6,
        onTime: 7,
        unscheduled: 4,
      },
      followUps: { drafts: 8, finalizedThisMonth: 11 },
      subprocesses: { active: 4 },
    })
  })

  it('returns attention rows ordered by urgency with pagination', async () => {
    const prisma = createAttentionPrismaMock()
    const service = new DashboardService(
      prisma as unknown as PrismaService,
    )

    const result = await service.findAttention({
      page: 2,
      pageSize: 5,
    })

    expect(
      prisma.counterparty.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    )
    expect(result.meta).toEqual({
      page: 2,
      pageSize: 5,
      total: 3,
      totalPages: 1,
    })
    expect(result.data[0]).toMatchObject({
      businessName: 'Contraparte vencida',
      calendarStatus: 'OVERDUE',
      daysUntilFollowUp: -2,
      nextFollowUpDate: '2026-11-04',
    })
    expect(result.data[1]).toMatchObject({
      calendarStatus: 'PENDING',
      daysUntilFollowUp: 4,
    })
    expect(result.data[2]).toMatchObject({
      calendarStatus: 'UNSCHEDULED',
      daysUntilFollowUp: null,
      nextFollowUpDate: null,
    })
  })
})
