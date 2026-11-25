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
import {
  ANNUAL_SOURCES,
  DEFAULT_ANNUAL_SOURCE,
  type AnnualSource,
} from '../annual-updates/annual-sources.js'
import { PrismaService } from '../prisma/prisma.service.js'

type AnnualNotificationRow = {
  id: string
  type: AnnualNotificationType
  message: string
  scheduledDate: Date
  createdAt: Date
  annualCounterparty: {
    id: string
    source: string
    code: string
    businessName: string
    filingDate: Date | null
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
      source: true,
      code: true,
      businessName: true,
      filingDate: true,
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
    currentDueDate: currentAnnualDueDate(
      row.annualCounterparty.filingDate,
    ),
    createdAt: row.createdAt,
    process: 'ANNUAL' as const,
    source: row.annualCounterparty.source as AnnualSource,
    counterparty: null,
    annualCounterparty: {
      source: row.annualCounterparty.source as AnnualSource,
      id: row.annualCounterparty.id,
      code: row.annualCounterparty.code,
      businessName: row.annualCounterparty.businessName,
    },
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

function currentAnnualDueDate(filingDate: Date | null): string | null {
  return filingDate ? toDateOnly(annualDueDate(filingDate)) : null
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
      currentDueDate: currentAnnualDueDate(
        notification.annualCounterparty.filingDate,
      ),
      createdAt: notification.createdAt,
      process: 'ANNUAL' as const,
      source: notification.annualCounterparty.source as AnnualSource,
      counterparty: null,
      annualCounterparty: {
        source: notification.annualCounterparty.source as AnnualSource,
        id: notification.annualCounterparty.id,
        code: notification.annualCounterparty.code,
        businessName: notification.annualCounterparty.businessName,
      },
      read: true,
      readAt: read.readAt,
    }
  }

  async generateDaily(
    source: AnnualSource = DEFAULT_ANNUAL_SOURCE,
  ) {
    const today = getBusinessToday()
    const minimumFilingDate = minimumAnnualFilingDate(
      today.getUTCFullYear(),
    )
    const counterparties =
      await this.prisma.annualCounterparty.findMany({
        where: {
          source,
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

  async generateAllDaily(): Promise<{
    evaluated: number
    created: number
  }> {
    let evaluated = 0
    let created = 0

    for (const source of ANNUAL_SOURCES) {
      const result = await this.generateDaily(source)
      evaluated += result.evaluated
      created += result.created
    }

    return { evaluated, created }
  }
}
