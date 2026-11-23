import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  CounterpartyStatus,
  NotificationType,
  Prisma,
} from '@prisma/client'
import {
  getBusinessToday,
  toDateOnly,
} from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

type NotificationRow = {
  id: string
  type: NotificationType
  message: string
  scheduledDate: Date
  createdAt: Date
  counterparty: {
    id: string
    businessName: string
    nit: string
  }
  reads: { readAt: Date }[]
}

const notificationBaseSelect = {
  id: true,
  type: true,
  message: true,
  scheduledDate: true,
  createdAt: true,
  counterparty: {
    select: {
      id: true,
      businessName: true,
      nit: true,
    },
  },
} satisfies Prisma.NotificationSelect

function notificationListSelect(userId: string) {
  return {
    ...notificationBaseSelect,
    reads: {
      where: { userId },
      select: { readAt: true },
    },
  } satisfies Prisma.NotificationSelect
}

function serializeNotification(row: NotificationRow) {
  const read = row.reads[0] ?? null

  return {
    id: row.id,
    type: row.type,
    message: row.message,
    scheduledDate: toDateOnly(row.scheduledDate),
    createdAt: row.createdAt,
    counterparty: row.counterparty,
    read: Boolean(read),
    readAt: read?.readAt ?? null,
  }
}

function resolveType(daysUntilDue: number): NotificationType | null {
  if (daysUntilDue > 30) {
    return null
  }

  if (daysUntilDue > 15) {
    return NotificationType.D30
  }

  if (daysUntilDue > 0) {
    return NotificationType.D15
  }

  if (daysUntilDue === 0) {
    return NotificationType.DUE
  }

  return NotificationType.OVERDUE
}

function buildMessage(
  businessName: string,
  type: NotificationType,
  daysUntilDue: number,
  dueDate: string,
) {
  switch (type) {
    case NotificationType.D30:
    case NotificationType.D15:
      return `El seguimiento de ${businessName} vence en ${daysUntilDue} días (${dueDate}).`
    case NotificationType.DUE:
      return `El seguimiento de ${businessName} vence hoy (${dueDate}).`
    case NotificationType.OVERDUE:
      return `El seguimiento de ${businessName} está vencido desde el ${dueDate}.`
  }
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const select = notificationListSelect(userId)
    const activeOnly: Prisma.NotificationWhereInput = {
      counterparty: { status: CounterpartyStatus.ACTIVE },
    }

    const [rows, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: activeOnly,
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.notification.count({
        where: {
          ...activeOnly,
          reads: { none: { userId } },
        },
      }),
    ])

    return {
      data: rows.map((row) => serializeNotification(row)),
      unreadCount,
    }
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: notificationBaseSelect,
    })

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada')
    }

    const read = await this.prisma.notificationRead.upsert({
      where: {
        notificationId_userId: {
          notificationId: id,
          userId,
        },
      },
      create: { notificationId: id, userId },
      update: {},
      select: { readAt: true },
    })

    return {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      scheduledDate: toDateOnly(notification.scheduledDate),
      createdAt: notification.createdAt,
      counterparty: notification.counterparty,
      read: true,
      readAt: read.readAt,
    }
  }

  async generateDaily() {
    const today = getBusinessToday()
    const counterparties = await this.prisma.counterparty.findMany({
      where: {
        status: CounterpartyStatus.ACTIVE,
        nextFollowUpDate: { not: null },
      },
      select: {
        id: true,
        businessName: true,
        nextFollowUpDate: true,
      },
    })

    const data: Prisma.NotificationCreateManyInput[] = []

    for (const counterparty of counterparties) {
      if (!counterparty.nextFollowUpDate) {
        continue
      }

      const daysUntilDue = Math.round(
        (counterparty.nextFollowUpDate.getTime() - today.getTime()) /
          DAY_IN_MS,
      )
      const type = resolveType(daysUntilDue)

      if (!type) {
        continue
      }

      const dueDate = toDateOnly(counterparty.nextFollowUpDate)

      data.push({
        counterpartyId: counterparty.id,
        type,
        message: buildMessage(
          counterparty.businessName,
          type,
          daysUntilDue,
          dueDate ?? '',
        ),
        scheduledDate: counterparty.nextFollowUpDate,
      })
    }

    if (data.length === 0) {
      return { evaluated: counterparties.length, created: 0 }
    }

    const result = await this.prisma.notification.createMany({
      data,
      skipDuplicates: true,
    })

    if (result.count > 0) {
      this.logger.log(
        `Se generaron ${result.count} notificaciones para ${data.length} contrapartes evaluadas`,
      )
    }

    return {
      evaluated: counterparties.length,
      created: result.count,
    }
  }
}
