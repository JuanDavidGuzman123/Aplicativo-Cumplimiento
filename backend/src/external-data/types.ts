export const EXTERNAL_SOURCES = ['arriendos', 'colocadores'] as const

export type ExternalSource = (typeof EXTERNAL_SOURCES)[number]

export const EXTERNAL_ANNUAL_STATUSES = ['ACTIVE', 'INACTIVE'] as const

export type ExternalAnnualStatus =
  (typeof EXTERNAL_ANNUAL_STATUSES)[number]

export const EXTERNAL_UPDATE_FILTERS = [
  'UPDATED_THIS_YEAR',
  'PENDING',
  'NO_DATE',
] as const

export type ExternalUpdateFilter =
  (typeof EXTERNAL_UPDATE_FILTERS)[number]

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

export type ExternalAnnualMapping = Partial<
  Record<
    | 'code'
    | 'nit'
    | 'businessName'
    | 'status'
    | 'filingDate'
    | 'filingYear'
    | 'dueDiligenceType'
    | 'requiresSemiannualFollowUp'
    | 'observations',
    string | null
  >
>

export type ExternalImportHeader = {
  value: string
  label: string
}

export type ExternalAnnualRow = {
  id: string
  code: string
  nit: string | null
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

export type ExternalWorkbookRow = {
  rowNumber: number
  values: string[]
}

export type ExternalWorkbookData = {
  fileName: string
  sourceName: string
  sourceUrl: string | null
  tableOrWorksheet: string
  headers: ExternalImportHeader[]
  rows: ExternalWorkbookRow[]
  version: string
  lastModifiedDateTime: string | null
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

export type ExternalConnection =
  | 'disabled'
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'error'

export type ExternalFreshness = 'never' | 'fresh' | 'stale' | 'error'

export type ExternalSubscriptionState =
  | 'disabled'
  | 'unconfigured'
  | 'active'
  | 'pending'
  | 'expired'
  | 'error'

export type ExternalSubscriptionStatus = {
  state: ExternalSubscriptionState
  id: string | null
  expiresAt: string | null
  message: string | null
}

export type ExternalDataStatus = {
  source: ExternalSource
  enabled: boolean
  configured: boolean
  connection: ExternalConnection
  freshness: ExternalFreshness
  sourceName: string | null
  sourceUrl: string | null
  version: string | null
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastChangeAt: string | null
  lastError: string | null
  rowCount: number
  mappingErrors: string[]
  subscription: ExternalSubscriptionStatus
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

export const EXTERNAL_REPORT_METRICS = [
  'active',
  'inactive',
  'updated-this-year',
  'pending-active',
  'follow-up',
  'updates-due',
] as const

export type ExternalReportMetric =
  (typeof EXTERNAL_REPORT_METRICS)[number]

export type ExternalReport = {
  metric: ExternalReportMetric
  title: string
  subtitle: string
  generatedAt: string
  currentYear: number
  rows: ExternalUpdateDueRow[]
}

export type ExternalPendingActiveReport = ExternalReport

export type ExternalStreamEvent = {
  type: 'status' | 'updated' | 'error'
  source: ExternalSource
  at: string
  status: ExternalDataStatus
  changes?: ExternalSyncStats
}

export type ExternalGraphSubscription = {
  id: string
  resource: string
  notificationUrl: string
  expirationDateTime: string
  clientState?: string | null
}

export type ExternalListQuery = {
  code?: string
  search?: string
  status?: ExternalAnnualStatus
  annualStatus?: ExternalUpdateFilter
  requiresSemiannualFollowUp?: boolean
  page: number
  pageSize: number
}

export type ExternalDueQuery = {
  page: number
  pageSize: number
}
