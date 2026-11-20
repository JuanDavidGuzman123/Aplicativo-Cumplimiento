import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  AnnualNotificationType,
  AnnualStatus,
  Prisma,
} from '@prisma/client'
import {
  annualDueDate,
  daysUntil,
  minimumAnnualFilingDate,
  resolveAnnualReminderType,
} from '../annual-updates/annual-dates.js'
import {
  getBusinessToday,
  toDateOnly,
} from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'

type AnnualNotificationRow = {
  id: string
  type: AnnualNotificationType
  message: string
  scheduledDate: Date
  createdAt: Date
  annualCounterparty: {
    id: string
    code: string
    businessName: string
  }
  reads: { readAt: Date }[]
}

const annualNotificationBaseSelect = {
  id: true,
  type: true,
  message: true,
  scheduledDate: true,
  createdAt: true,
  annualCounterparty: {
    select: {
      id: true,
      code: true,
      businessName: true,
    },
  },
} satisfies Prisma.AnnualNotificationSelect

function annualNotificationListSelect(userId: string) {
  return {
    ...annualNotificationBaseSelect,
    reads: {
      where: { userId },
      select: { readAt: true },
    },
  } satisfies Prisma.AnnualNotificationSelect
}

function serialize(row: AnnualNotificationRow) {
  const read = row.reads[0] ?? null

  return {
    id: row.id,
    type: row.type,
    message: row.message,
    scheduledDate: toDateOnly(row.scheduledDate),
    createdAt: row.createdAt,
    source: 'ANNUAL' as const,
    counterparty: null,
    annualCounterparty: row.annualCounterparty,
    read: Boolean(read),
    readAt: read?.readAt ?? null,
  }
}

function buildMessage(
  businessName: string,
  days: number,
  dueDate: string,
): string {
  return `La actualización anual de ${businessName} vence en ${days} días (${dueDate}).`
}

@Injectable()
export class AnnualNotificationsService {
  private readonly logger = new Logger(
    AnnualNotificationsService.name,
  )

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const select = annualNotificationListSelect(userId)

    const [rows, unreadCount] = await this.prisma.$transaction([
      this.prisma.annualNotification.findMany({
        select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.annualNotification.count({
        where: { reads: { none: { userId } } },
      }),
    ])

    return {
      data: rows.map((row) => serialize(row)),
      unreadCount,
    }
  }

  async markRead(id: string, userId: string) {
    const notification =
      await this.prisma.annualNotification.findUnique({
        where: { id },
        select: annualNotificationBaseSelect,
      })

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada')
    }

    const read = await this.prisma.annualNotificationRead.upsert({
      where: {
        annualNotificationId_userId: {
          annualNotificationId: id,
          userId,
        },
      },
      create: { annualNotificationId: id, userId },
      update: {},
      select: { readAt: true },
    })

    return {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      scheduledDate: toDateOnly(notification.scheduledDate),
      createdAt: notification.createdAt,
      source: 'ANNUAL' as const,
      counterparty: null,
      annualCounterparty: notification.annualCounterparty,
      read: true,
      readAt: read.readAt,
    }
  }

  async generateDaily() {
    const today = getBusinessToday()
    const minimumFilingDate = minimumAnnualFilingDate(
      today.getUTCFullYear(),
    )
    const counterparties =
      await this.prisma.annualCounterparty.findMany({
        where: {
          status: AnnualStatus.ACTIVE,
          filingDate: { gte: minimumFilingDate },
        },
        select: {
          id: true,
          businessName: true,
          filingDate: true,
        },
      })

    const data: Prisma.AnnualNotificationCreateManyInput[] = []

    for (const counterparty of counterparties) {
      if (
        !counterparty.filingDate ||
        counterparty.filingDate < minimumFilingDate
      ) {
        continue
      }

      const dueDate = annualDueDate(counterparty.filingDate)
      const days = daysUntil(dueDate, today)
      const type = resolveAnnualReminderType(days)

      if (!dueDate || days === null || !type) {
        continue
      }

      const dueDateValue = toDateOnly(dueDate) ?? ''

      data.push({
        annualCounterpartyId: counterparty.id,
        type,
        message: buildMessage(
          counterparty.businessName,
          days,
          dueDateValue,
        ),
        scheduledDate: dueDate,
      })
    }

    if (data.length === 0) {
      return { evaluated: counterparties.length, created: 0 }
    }

    const result =
      await this.prisma.annualNotification.createMany({
        data,
        skipDuplicates: true,
      })

    if (result.count > 0) {
      this.logger.log(
        `Se generaron ${result.count} notificaciones anuales para ${data.length} contrapartes evaluadas`,
      )
    }

    return {
      evaluated: counterparties.length,
      created: result.count,
    }
  }
}
