import { NotFoundException } from '@nestjs/common'
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
import { ANNUAL_SOURCES } from '../annual-updates/annual-sources.js'
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
    findUnique: ReturnType<typeof vi.fn>
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
      findUnique: vi.fn(),
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

  it('maps only the exact 15, 5, 1 and due days', () => {
    expect(resolveAnnualReminderType(16)).toBeNull()
    expect(resolveAnnualReminderType(15)).toBe(
      AnnualNotificationType.ANNUAL_D15,
    )
    expect(resolveAnnualReminderType(9)).toBeNull()
    expect(resolveAnnualReminderType(6)).toBeNull()
    expect(resolveAnnualReminderType(5)).toBe(
      AnnualNotificationType.ANNUAL_D5,
    )
    expect(resolveAnnualReminderType(4)).toBeNull()
    expect(resolveAnnualReminderType(2)).toBeNull()
    expect(resolveAnnualReminderType(1)).toBe(
      AnnualNotificationType.ANNUAL_D1,
    )
    expect(resolveAnnualReminderType(0)).toBe(
      AnnualNotificationType.ANNUAL_DUE,
    )
    expect(resolveAnnualReminderType(-1)).toBeNull()
  })
})

describe('AnnualNotificationsService', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = createPrismaMock()
  })

  it('generates one reminder per active counterparty on exact reminder days', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([
      {
        id: 'row-1',
        businessName: 'Empresa 15',
        filingDate: filingDateForDue(15),
      },
      {
        id: 'row-2',
        businessName: 'Empresa 5',
        filingDate: filingDateForDue(5),
      },
      {
        id: 'row-3',
        businessName: 'Empresa 1',
        filingDate: filingDateForDue(1),
      },
      {
        id: 'row-4',
        businessName: 'Empresa hoy',
        filingDate: filingDateForDue(0),
      },
      {
        id: 'row-6',
        businessName: 'Empresa 6',
        filingDate: filingDateForDue(6),
      },
      {
        id: 'row-2',
        businessName: 'Empresa 2',
        filingDate: filingDateForDue(2),
      },
      {
        id: 'row-7',
        businessName: 'Empresa vencida',
        filingDate: filingDateForDue(-1),
      },
    ])
    prisma.annualNotification.createMany.mockResolvedValue({
      count: 4,
    })

    const service = createService(prisma)
    const result = await service.generateDaily()

    expect(result).toEqual({ evaluated: 7, created: 4 })
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
        AnnualNotificationType.ANNUAL_D15,
        AnnualNotificationType.ANNUAL_D5,
        AnnualNotificationType.ANNUAL_D1,
        AnnualNotificationType.ANNUAL_DUE,
      ],
    )
    expect(data[0]).toMatchObject({
      annualCounterpartyId: 'row-1',
      scheduledDate: annualDueDate(filingDateForDue(15)),
    })
  })

  it('serializes notifications for the requested user with read state and unread count', async () => {
    const filingDate = filingDateForDue(15)
    const scheduledDate = annualDueDate(filingDate)!
    const filingDateUnread = filingDateForDue(1)
    const scheduledDateUnread = annualDueDate(filingDateUnread)!
    const createdAt = new Date('2026-11-01T00:00:00.000Z')
    const createdAtUnread = new Date('2026-11-20T00:00:00.000Z')
    const readAt = new Date('2026-11-02T12:00:00.000Z')
    const messageRead = `La actualización anual de Empresa Uno vence en 15 días (${scheduledDate.toISOString().slice(0, 10)}).`
    const messageUnread = `La actualización anual de Empresa Dos vence en 1 día (${scheduledDateUnread.toISOString().slice(0, 10)}).`

    prisma.annualNotification.findMany.mockResolvedValue([
      {
        id: 'notification-1',
        type: AnnualNotificationType.ANNUAL_D15,
        message: messageRead,
        scheduledDate,
        createdAt,
        annualCounterparty: {
          id: 'counterparty-1',
          source: 'clientes',
          code: 'CLI-1',
          businessName: 'Empresa Uno',
          filingDate,
        },
        reads: [{ readAt }],
      },
      {
        id: 'notification-2',
        type: AnnualNotificationType.ANNUAL_D1,
        message: messageUnread,
        scheduledDate: scheduledDateUnread,
        createdAt: createdAtUnread,
        annualCounterparty: {
          id: 'counterparty-2',
          source: 'arriendos',
          code: 'ARR-2',
          businessName: 'Empresa Dos',
          filingDate: filingDateUnread,
        },
        reads: [],
      },
    ])

    const result = await createService(prisma).findAll('user-7')

    expect(result).toEqual({
      unreadCount: 1,
      data: [
        {
          id: 'notification-1',
          type: AnnualNotificationType.ANNUAL_D15,
          message: messageRead,
          scheduledDate: scheduledDate.toISOString().slice(0, 10),
          currentDueDate: scheduledDate.toISOString().slice(0, 10),
          createdAt,
          process: 'ANNUAL',
          source: 'clientes',
          counterparty: null,
          annualCounterparty: {
            source: 'clientes',
            id: 'counterparty-1',
            code: 'CLI-1',
            businessName: 'Empresa Uno',
          },
          read: true,
          readAt,
        },
        {
          id: 'notification-2',
          type: AnnualNotificationType.ANNUAL_D1,
          message: messageUnread,
          scheduledDate: scheduledDateUnread.toISOString().slice(0, 10),
          currentDueDate: scheduledDateUnread.toISOString().slice(0, 10),
          createdAt: createdAtUnread,
          process: 'ANNUAL',
          source: 'arriendos',
          counterparty: null,
          annualCounterparty: {
            source: 'arriendos',
            id: 'counterparty-2',
            code: 'ARR-2',
            businessName: 'Empresa Dos',
          },
          read: false,
          readAt: null,
        },
      ],
    })
    expect(prisma.annualNotification.findMany).toHaveBeenCalledWith({
      where: {
        type: {
          in: [
            AnnualNotificationType.ANNUAL_D15,
            AnnualNotificationType.ANNUAL_D5,
            AnnualNotificationType.ANNUAL_D1,
            AnnualNotificationType.ANNUAL_DUE,
          ],
        },
      },
      select: {
        id: true,
        type: true,
        message: true,
        scheduledDate: true,
        createdAt: true,
        annualCounterparty: {
          select: {
            id: true,
            source: true,
            code: true,
            businessName: true,
            filingDate: true,
          },
        },
        reads: {
          where: { userId: 'user-7' },
          select: { readAt: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    expect(prisma.annualNotification.count).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('returns only the latest reminder for each annual obligation', async () => {
    const filingDate = filingDateForDue(5)
    const scheduledDate = annualDueDate(filingDate)!
    const older = {
      id: 'notification-15',
      type: AnnualNotificationType.ANNUAL_D15,
      message: 'Recordatorio anterior',
      scheduledDate,
      createdAt: new Date('2026-06-05T00:00:00.000Z'),
      annualCounterparty: {
        id: 'counterparty-1',
        source: 'arriendos',
        code: 'ARR-1',
        businessName: 'Empresa Uno',
        filingDate,
      },
      reads: [],
    }
    const latest = {
      ...older,
      id: 'notification-5',
      type: AnnualNotificationType.ANNUAL_D5,
      message: `La actualización anual de Empresa Uno vence en 5 días (${scheduledDate.toISOString().slice(0, 10)}).`,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
      reads: [{ readAt: new Date('2026-06-16T00:00:00.000Z') }],
    }

    prisma.annualNotification.findMany.mockResolvedValue([
      latest,
      older,
    ])

    const result = await createService(prisma).findAll('user-7')

    expect(result.unreadCount).toBe(0)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 'notification-5',
      type: AnnualNotificationType.ANNUAL_D5,
      currentDueDate: scheduledDate.toISOString().slice(0, 10),
      read: true,
    })
  })

  it('does not expose reminders for overdue obligations', async () => {
    const filingDate = filingDateForDue(-1)
    const scheduledDate = annualDueDate(filingDate)!

    prisma.annualNotification.findMany.mockResolvedValue([
      {
        id: 'notification-overdue',
        type: AnnualNotificationType.ANNUAL_DUE,
        message: `La actualización anual de Empresa Uno vence hoy (${scheduledDate.toISOString().slice(0, 10)}).`,
        scheduledDate,
        createdAt: new Date('2026-11-24T00:00:00.000Z'),
        annualCounterparty: {
          id: 'counterparty-1',
          source: 'arriendos',
          code: 'ARR-1',
          businessName: 'Empresa Uno',
          filingDate,
        },
        reads: [],
      },
    ])

    const result = await createService(prisma).findAll('user-7')

    expect(result).toEqual({ data: [], unreadCount: 0 })
  })

  it('marks a notification as read for the requested user', async () => {
    const filingDate = new Date('2025-06-20T00:00:00.000Z')
    const scheduledDate = new Date('2026-06-17T00:00:00.000Z')
    const createdAt = new Date('2026-06-16T00:00:00.000Z')
    const readAt = new Date('2026-06-17T09:30:00.000Z')
    const message =
      'La actualización anual de Empresa Uno vence en 1 días (2026-06-20).'

    prisma.annualNotification.findUnique.mockResolvedValue({
      id: 'notification-1',
      type: AnnualNotificationType.ANNUAL_D1,
      message,
      scheduledDate,
      createdAt,
      annualCounterparty: {
        id: 'counterparty-1',
        source: 'arriendos',
        code: 'ARR-1',
        businessName: 'Empresa Uno',
        filingDate,
      },
    })
    prisma.annualNotificationRead.upsert.mockResolvedValue({
      readAt,
    })

    const result = await createService(prisma).markRead(
      'notification-1',
      'user-7',
    )

    expect(result).toEqual({
      id: 'notification-1',
      type: AnnualNotificationType.ANNUAL_D1,
      message,
      scheduledDate: '2026-06-17',
      currentDueDate: '2026-06-20',
      createdAt,
      process: 'ANNUAL',
      source: 'arriendos',
      counterparty: null,
      annualCounterparty: {
        source: 'arriendos',
        id: 'counterparty-1',
        code: 'ARR-1',
        businessName: 'Empresa Uno',
      },
      read: true,
      readAt,
    })
    expect(prisma.annualNotification.findUnique).toHaveBeenCalledWith({
      where: { id: 'notification-1' },
      select: {
        id: true,
        type: true,
        message: true,
        scheduledDate: true,
        createdAt: true,
        annualCounterparty: {
          select: {
            id: true,
            source: true,
            code: true,
            businessName: true,
            filingDate: true,
          },
        },
      },
    })
    expect(prisma.annualNotificationRead.upsert).toHaveBeenCalledWith({
      where: {
        annualNotificationId_userId: {
          annualNotificationId: 'notification-1',
          userId: 'user-7',
        },
      },
      create: {
        annualNotificationId: 'notification-1',
        userId: 'user-7',
      },
      update: {},
      select: { readAt: true },
    })
  })

  it('throws when the notification to mark as read does not exist', async () => {
    prisma.annualNotification.findUnique.mockResolvedValue(null)

    await expect(
      createService(prisma).markRead('missing', 'user-7'),
    ).rejects.toThrow(NotFoundException)
    expect(
      prisma.annualNotificationRead.upsert,
    ).not.toHaveBeenCalled()
  })

  it('does not create notifications when there are no eligible counterparties', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([])

    const result = await createService(prisma).generateDaily()

    expect(result).toEqual({ evaluated: 0, created: 0 })
    expect(
      prisma.annualNotification.createMany,
    ).not.toHaveBeenCalled()
  })

  it('does not create notifications for counterparties outside reminder windows', async () => {
    prisma.annualCounterparty.findMany.mockResolvedValue([
      {
        id: 'row-far',
        businessName: 'Empresa futura',
        filingDate: filingDateForDue(30),
      },
      {
        id: 'row-sixteen',
        businessName: 'Empresa dieciséis',
        filingDate: filingDateForDue(16),
      },
      {
        id: 'row-null',
        businessName: 'Sin fecha',
        filingDate: null,
      },
    ])

    const result = await createService(prisma).generateDaily()

    expect(result).toEqual({ evaluated: 3, created: 0 })
    expect(
      prisma.annualNotification.createMany,
    ).not.toHaveBeenCalled()
  })

  it('generates daily notifications once per annual source and sums totals', async () => {
    const service = createService(prisma)
    const generateDaily = vi
      .spyOn(service, 'generateDaily')
      .mockResolvedValueOnce({ evaluated: 2, created: 1 })
      .mockResolvedValueOnce({ evaluated: 5, created: 3 })
      .mockResolvedValueOnce({ evaluated: 1, created: 1 })

    const result = await service.generateAllDaily()

    expect(
      generateDaily.mock.calls.map(([source]) => source),
    ).toEqual([...ANNUAL_SOURCES])
    expect(result).toEqual({ evaluated: 8, created: 5 })
    generateDaily.mockRestore()
  })
})
