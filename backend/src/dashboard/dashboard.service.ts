import { Injectable } from '@nestjs/common'
import {
  CounterpartyStatus,
  FollowUpStatus,
  Prisma,
} from '@prisma/client'
import { calculateCalendarStatus } from '../common/utils/calendar-status.js'
import {
  addDays,
  getBusinessToday,
  toDateOnly,
} from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ListDashboardAttentionQueryDto } from './dto/list-dashboard-attention-query.dto.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

const attentionSelect = {
  id: true,
  nit: true,
  businessName: true,
  lastFollowUpDate: true,
  nextFollowUpDate: true,
  subprocess: {
    select: { id: true, name: true, active: true },
  },
} satisfies Prisma.CounterpartySelect

type AttentionRow = Prisma.CounterpartyGetPayload<{
  select: typeof attentionSelect
}>

function startOfMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  )
}

function startOfNextMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  )
}

function daysUntilFollowUp(
  nextFollowUpDate: Date | null,
  today: Date,
): number | null {
  if (!nextFollowUpDate) {
    return null
  }

  return Math.round(
    (nextFollowUpDate.getTime() - today.getTime()) / DAY_IN_MS,
  )
}

function serializeAttention(row: AttentionRow, today: Date) {
  return {
    id: row.id,
    nit: row.nit,
    businessName: row.businessName,
    lastFollowUpDate: toDateOnly(row.lastFollowUpDate),
    nextFollowUpDate: toDateOnly(row.nextFollowUpDate),
    calendarStatus: calculateCalendarStatus(row.nextFollowUpDate, today),
    daysUntilFollowUp: daysUntilFollowUp(row.nextFollowUpDate, today),
    subprocess: row.subprocess,
  }
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const today = getBusinessToday()
    const pendingStart = today
    const pendingEnd = addDays(today, 15)
    const upcomingStart = addDays(today, 16)
    const upcomingEnd = addDays(today, 30)
    const currentMonthStart = startOfMonth(today)
    const nextMonthStart = startOfNextMonth(today)
    const active: Prisma.CounterpartyWhereInput = {
      status: CounterpartyStatus.ACTIVE,
    }

    const [
      activeCounterparties,
      archivedCounterparties,
      overdue,
      pending,
      upcoming,
      onTime,
      unscheduled,
      draftFollowUps,
      finalizedThisMonth,
      activeSubprocesses,
    ] = await this.prisma.$transaction([
      this.prisma.counterparty.count({ where: active }),
      this.prisma.counterparty.count({
        where: { status: CounterpartyStatus.ARCHIVED },
      }),
      this.prisma.counterparty.count({
        where: {
          ...active,
          nextFollowUpDate: { lt: today },
        },
      }),
      this.prisma.counterparty.count({
        where: {
          ...active,
          nextFollowUpDate: { gte: pendingStart, lte: pendingEnd },
        },
      }),
      this.prisma.counterparty.count({
        where: {
          ...active,
          nextFollowUpDate: { gte: upcomingStart, lte: upcomingEnd },
        },
      }),
      this.prisma.counterparty.count({
        where: {
          ...active,
          nextFollowUpDate: { gt: upcomingEnd },
        },
      }),
      this.prisma.counterparty.count({
        where: { ...active, nextFollowUpDate: null },
      }),
      this.prisma.followUp.count({
        where: { status: FollowUpStatus.DRAFT },
      }),
      this.prisma.followUp.count({
        where: {
          status: FollowUpStatus.FINALIZED,
          finalizedAt: { gte: currentMonthStart, lt: nextMonthStart },
        },
      }),
      this.prisma.subprocess.count({ where: { active: true } }),
    ])

    return {
      businessDate: today.toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      counterparties: {
        active: activeCounterparties,
        archived: archivedCounterparties,
      },
      calendar: {
        overdue,
        pending,
        upcoming,
        onTime,
        unscheduled,
      },
      followUps: {
        drafts: draftFollowUps,
        finalizedThisMonth,
      },
      subprocesses: {
        active: activeSubprocesses,
      },
    }
  }

  async findAttention(query: ListDashboardAttentionQueryDto) {
    const today = getBusinessToday()
    const page = query.page
    const pageSize = query.pageSize
    const attentionEnd = addDays(today, 15)
    const where: Prisma.CounterpartyWhereInput = {
      status: CounterpartyStatus.ACTIVE,
      OR: [
        { nextFollowUpDate: null },
        { nextFollowUpDate: { lte: attentionEnd } },
      ],
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.counterparty.findMany({
        where,
        select: attentionSelect,
        orderBy: [
          { nextFollowUpDate: { sort: 'asc', nulls: 'last' } },
          { businessName: 'asc' },
          { nit: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.counterparty.count({ where }),
    ])

    return {
      data: rows.map((row) => serializeAttention(row, today)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }
}
