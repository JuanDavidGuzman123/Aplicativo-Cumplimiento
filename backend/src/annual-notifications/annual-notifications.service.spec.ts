import {
  AnnualNotificationType,
  AnnualStatus,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNUAL_DAY_IN_MS,
  annualDueDate,
  minimumAnnualFilingDate,
  resolveAnnualReminderType,
} from '../annual-updates/annual-dates.js'
import { getBusinessToday } from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { AnnualNotificationsService } from './annual-notifications.service.js'

const today = getBusinessToday()

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

type PrismaMock = {
  annualCounterparty: {
    findMany: ReturnType<typeof vi.fn>
  }
  annualNotification: {
    findMany: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  annualNotificationRead: {
    upsert: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

function createPrismaMock(): PrismaMock {
  return {
    annualCounterparty: {
      findMany: vi.fn(),
    },
    annualNotification: {
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
    },
    annualNotificationRead: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  }
}

function createService(prisma: PrismaMock) {
  return new AnnualNotificationsService(
    prisma as unknown as PrismaService,
  )
}

describe('annual dates', () => {
  it('moves leap-day filing dates to February 28', () => {
    const due = annualDueDate(
      new Date('2024-02-29T00:00:00.000Z'),
    )

    expect(due?.toISOString()).toBe('2025-02-28T00:00:00.000Z')
  })

  it('maps only the 3 and 1 day windows', () => {
    expect(resolveAnnualReminderType(4)).toBeNull()
    expect(resolveAnnualReminderType(3)).toBe(
      AnnualNotificationType.ANNUAL_D3,
    )
    expect(resolveAnnualReminderType(2)).toBe(
      AnnualNotificationType.ANNUAL_D3,
    )
    expect(resolveAnnualReminderType(1)).toBe(
      AnnualNotificationType.ANNUAL_D1,
    )
    expect(resolveAnnualReminderType(0)).toBe(
      AnnualNotificationType.ANNUAL_D1,
    )
    expect(resolveAnnualReminderType(-1)).toBeNull()
  })
})

describe('AnnualNotificationsService', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = createPrismaMock()
  })

  it('generates one reminder per active counterparty inside a reminder window', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([
      {
        id: 'row-1',
        businessName: 'Empresa 3',
        filingDate: filingDateForDue(3),
      },
      {
        id: 'row-2',
        businessName: 'Empresa 1',
        filingDate: filingDateForDue(1),
      },
      {
        id: 'row-3',
        businessName: 'Empresa futura',
        filingDate: filingDateForDue(30),
      },
      {
        id: 'row-4',
        businessName: 'Empresa 10',
        filingDate: filingDateForDue(10),
      },
    ])
    prisma.annualNotification.createMany.mockResolvedValue({
      count: 2,
    })

    const service = createService(prisma)
    const result = await service.generateDaily()

    expect(result).toEqual({ evaluated: 4, created: 2 })
    expect(prisma.annualCounterparty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: 'arriendos',
          status: AnnualStatus.ACTIVE,
          filingDate: {
            gte: minimumAnnualFilingDate(today.getUTCFullYear()),
          },
        },
      }),
    )
    expect(prisma.annualNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    )

    const data =
      prisma.annualNotification.createMany.mock.calls[0][0].data

    expect(data.map((item: { type: string }) => item.type)).toEqual(
      [
        AnnualNotificationType.ANNUAL_D3,
        AnnualNotificationType.ANNUAL_D1,
      ],
    )
    expect(data[0]).toMatchObject({
      annualCounterpartyId: 'row-1',
      scheduledDate: annualDueDate(filingDateForDue(3)),
    })
  })
})
