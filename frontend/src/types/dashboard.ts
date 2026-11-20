import type {
  CalendarStatus,
  PaginationMeta,
} from './counterparty'

export type DashboardSummary = {
  businessDate: string
  generatedAt: string
  counterparties: {
    active: number
    archived: number
  }
  calendar: {
    overdue: number
    pending: number
    upcoming: number
    onTime: number
    unscheduled: number
  }
  followUps: {
    drafts: number
    finalizedThisMonth: number
  }
  subprocesses: {
    active: number
  }
}

export type DashboardAttentionItem = {
  id: string
  nit: string
  businessName: string
  lastFollowUpDate: string | null
  nextFollowUpDate: string | null
  calendarStatus: CalendarStatus
  daysUntilFollowUp: number | null
  subprocess: {
    id: string
    name: string
    active: boolean
  }
}

export type DashboardAttentionResponse = {
  data: DashboardAttentionItem[]
  meta: PaginationMeta
}
