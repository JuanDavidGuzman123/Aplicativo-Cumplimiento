export type ExternalAnnualStatus = 'ACTIVE' | 'INACTIVE'

export type ExternalUpdateFilter =
  | 'UPDATED_THIS_YEAR'
  | 'PENDING'
  | 'NO_DATE'

export type ExternalUpdateSituation =
  | 'WITHOUT_DATE'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'NOT_DUE'

export type ExternalReminderType =
  | 'ANNUAL_D15'
  | 'ANNUAL_D10'
  | 'ANNUAL_D5'
  | 'ANNUAL_D3'
  | 'ANNUAL_D1'

export type ExternalReportMetric =
  | 'active'
  | 'inactive'
  | 'updated-this-year'
  | 'pending-active'
  | 'pending-inactive'
  | 'follow-up'
  | 'updates-due'

export type ExternalAnnualRow = {
  id: string
  code: string
  businessName: string
  status: ExternalAnnualStatus
  requiresSemiannualFollowUp: boolean | null
  filingDate: string | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
  updatedThisYear: boolean
  annualStatus: ExternalUpdateFilter
  sourceFileName: string | null
  createdAt: string
  updatedAt: string
}

export type ExternalUpdateDueRow = ExternalAnnualRow & {
  dueDate: string | null
  daysUntilDue: number | null
  situation: ExternalUpdateSituation
  reminderType: ExternalReminderType | null
}

export type ExternalSummary = {
  businessDate: string
  currentYear: number
  totals: {
    total: number
    active: number
    inactive: number
  }
  annual: {
    updatedThisYear: number
    active: {
      total: number
      updatedThisYear: number
      pendingUpdate: number
      withoutDate: number
    }
    inactive: {
      total: number
      updatedThisYear: number
      pendingUpdate: number
      withoutDate: number
    }
  }
  semiannual: {
    activeWithFollowUp: number
    inactiveWithFollowUp: number
    totalWithFollowUp: number
  }
}

export type ExternalDueSummary = {
  needsUpdate: number
  overdue: number
  dueToday: number
  upcoming: number
  withoutDate: number
}

export type ExternalMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ExternalSubscriptionState =
  | 'disabled'
  | 'unconfigured'
  | 'active'
  | 'pending'
  | 'expired'
  | 'error'

export type ExternalDataStatus = {
  enabled: boolean
  configured: boolean
  connection:
    | 'disabled'
    | 'unconfigured'
    | 'connecting'
    | 'connected'
    | 'degraded'
    | 'error'
  freshness: 'never' | 'fresh' | 'stale' | 'error'
  sourceName: string | null
  sourceUrl: string | null
  version: string | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastChangeAt: string | null
  lastError: string | null
  rowCount: number
  mappingErrors: string[]
  subscription: {
    state: ExternalSubscriptionState
    id: string | null
    expiresAt: string | null
    message: string | null
  }
  webhookConfigured: boolean
  pollMs: number
  serverNow: string
}

export type ExternalAnnualListResponse = {
  data: ExternalAnnualRow[]
  meta: ExternalMeta
  status: ExternalDataStatus
}

export type ExternalDueListResponse = {
  data: ExternalUpdateDueRow[]
  meta: ExternalMeta
  summary: ExternalDueSummary
  status: ExternalDataStatus
}

export type ExternalSyncStats = {
  totalRows: number
  validRows: number
  ignoredRows: number
  errorRows: number
  added: number
  updated: number
  removed: number
  unchanged: number
}

export type ExternalStreamEvent = {
  type: 'status' | 'updated' | 'error'
  at: string
  status: ExternalDataStatus
  changes?: ExternalSyncStats
}

export type ExternalListParams = {
  code?: string
  search?: string
  status?: ExternalAnnualStatus | ''
  annualStatus?: ExternalUpdateFilter | ''
  requiresSemiannualFollowUp?: boolean | ''
  page?: number
  pageSize?: number
}
