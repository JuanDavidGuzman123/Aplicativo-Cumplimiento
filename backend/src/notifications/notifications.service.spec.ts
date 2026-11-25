import { NotFoundException } from '@nestjs/common'
import {
  CounterpartyStatus,
  NotificationType,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getBusinessToday } from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { NotificationsService } from './notifications.service.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const today = getBusinessToday()

function nextFollowUpForDue(days: number): Date {
  return new Date(today.getTime() + days * DAY_IN_MS)
}

type PrismaMock = {
  counterparty: {
    findMany: ReturnType<typeof vi.fn>
  }
  notification: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  notificationRead: {
    upsert: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

function createPrismaMock(): PrismaMock {
  return {
    counterparty: {
      findMany: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
    },
    notificationRead: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  }
}

function createService(prisma: PrismaMock) {
  return new NotificationsService(prisma as unknown as PrismaService)
}

describe('NotificationsService', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = createPrismaMock()
  })

  it('generates only the 3 day, 1 day and due-day reminders', async () => {
    prisma.counterparty.findMany.mockResolvedValue([
      { id: 'row-3', businessName: 'Empresa 3', nextFollowUpDate: nextFollowUpForDue(3) },
      { id: 'row-1', businessName: 'Empresa 1', nextFollowUpDate: nextFollowUpForDue(1) },
      { id: 'row-0', businessName: 'Empresa hoy', nextFollowUpDate: nextFollowUpForDue(0) },
      { id: 'row-2', businessName: 'Empresa 2', nextFollowUpDate: nextFollowUpForDue(2) },
      { id: 'row-old', businessName: 'Empresa vencida', nextFollowUpDate: nextFollowUpForDue(-1) },
    ])
    prisma.notification.createMany.mockResolvedValue({ count: 3 })

    const result = await createService(prisma).generateDaily()

    expect(result).toEqual({ evaluated: 5, created: 3 })
    expect(prisma.counterparty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: CounterpartyStatus.ACTIVE,
          nextFollowUpDate: { not: null },
        },
      }),
    )
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    )

    const data =
      prisma.notification.createMany.mock.calls[0][0].data

    expect(data.map((item: { type: string }) => item.type)).toEqual(
      [
        NotificationType.D3,
        NotificationType.D1,
        NotificationType.DUE,
      ],
    )
    expect(data[0].message).toContain('en 3 días')
    expect(data[2].message).toContain('vence hoy')
  })

  it('returns only the latest reminder for each follow-up obligation', async () => {
    const scheduledDate = nextFollowUpForDue(1)
    const nextFollowUpDate = nextFollowUpForDue(1)
    const counterparty = {
      id: 'counterparty-1',
      businessName: 'Empresa Uno',
      nit: '900000001',
      category: { key: 'ARRIENDOS' },
      nextFollowUpDate,
    }
    const older = {
      id: 'notification-3',
      type: NotificationType.D3,
      message: 'Recordatorio anterior',
      scheduledDate,
      createdAt: new Date('2026-06-17T00:00:00.000Z'),
      counterparty,
      reads: [{ readAt: new Date('2026-06-18T00:00:00.000Z') }],
    }
    const latest = {
      id: 'notification-1',
      type: NotificationType.D1,
      message: 'Recordatorio actual',
      scheduledDate,
      createdAt: new Date('2026-06-19T00:00:00.000Z'),
      counterparty,
      reads: [],
    }

    prisma.notification.findMany.mockResolvedValue([
      latest,
      older,
    ])

    const result = await createService(prisma).findAll('user-7')

    expect(result.unreadCount).toBe(1)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 'notification-1',
      type: NotificationType.D1,
      process: 'FOLLOW_UP',
      source: 'arriendos',
      currentDueDate: scheduledDate.toISOString().slice(0, 10),
      read: false,
    })
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: {
            in: [
              NotificationType.D3,
              NotificationType.D1,
              NotificationType.DUE,
            ],
          },
          counterparty: { status: CounterpartyStatus.ACTIVE },
        },
      }),
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('marks a notification as read for the requested user', async () => {
    const readAt = new Date('2026-06-20T09:30:00.000Z')

    prisma.notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      type: NotificationType.DUE,
      message: 'El seguimiento de Empresa Uno vence hoy (2026-06-20).',
      scheduledDate: new Date('2026-06-20T00:00:00.000Z'),
      createdAt: new Date('2026-06-20T07:00:00.000Z'),
      counterparty: {
        id: 'counterparty-1',
        businessName: 'Empresa Uno',
        nit: '900000001',
        category: { key: 'ARRIENDOS' },
        nextFollowUpDate: new Date('2026-06-20T00:00:00.000Z'),
      },
    })
    prisma.notificationRead.upsert.mockResolvedValue({ readAt })

    const result = await createService(prisma).markRead(
      'notification-1',
      'user-7',
    )

    expect(prisma.notificationRead.upsert).toHaveBeenCalledWith({
      where: {
        notificationId_userId: {
          notificationId: 'notification-1',
          userId: 'user-7',
        },
      },
      create: { notificationId: 'notification-1', userId: 'user-7' },
      update: {},
      select: { readAt: true },
    })
    expect(result).toMatchObject({
      id: 'notification-1',
      type: NotificationType.DUE,
      read: true,
      readAt,
    })
  })

  it('throws when the notification to mark as read does not exist', async () => {
    prisma.notification.findUnique.mockResolvedValue(null)

    await expect(
      createService(prisma).markRead('missing', 'user-7'),
    ).rejects.toThrow(NotFoundException)
    expect(prisma.notificationRead.upsert).not.toHaveBeenCalled()
  })
})
