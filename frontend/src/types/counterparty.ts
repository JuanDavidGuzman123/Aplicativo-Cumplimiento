export type CounterpartyStatus = 'ACTIVE' | 'ARCHIVED'

export type CalendarStatus =
  | 'OVERDUE'
  | 'PENDING'
  | 'UPCOMING'
  | 'ON_TIME'
  | 'UNSCHEDULED'

export type RiskDecision = 'CONTINUE' | 'ARCHIVE' | 'REACTIVATE'

export type CounterpartyCategory = {
  id: string
  key: string
  name: string
}

export type CategorySummary = CounterpartyCategory & {
  active: boolean
  sortOrder: number
  activeCount: number
  archivedCount: number
  totalCount: number
}

export type CounterpartySubprocess = {
  id: string
  name: string
  active: boolean
}

export type CounterpartyListItem = {
  id: string
  nit: string
  businessName: string
  status: CounterpartyStatus
  registrationDate: string
  lastFollowUpDate: string | null
  nextFollowUpDate: string | null
  calendarStatus: CalendarStatus
  evaluated?: boolean
  observations: string | null
  category: CounterpartyCategory
  subprocess: CounterpartySubprocess
}

export type RelatedUser = {
  id: string
  name: string
}

export type RiskEvaluation = {
  id: string
  decision: RiskDecision
  evaluatedAt: string
  nextFollowUpDate: string | null
  notes: string | null
  createdAt: string
  createdBy: RelatedUser
}

export type CounterpartyDetail = CounterpartyListItem & {
  observations: string | null
  archivedAt: string | null
  archiveReason: string | null
  archivedBy: RelatedUser | null
  reactivatedAt: string | null
  reactivationReason: string | null
  reactivatedBy: RelatedUser | null
  createdAt: string
  updatedAt: string
  followUpCount: number
  riskEvaluations: RiskEvaluation[]
}

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type CounterpartyListResponse = {
  data: CounterpartyListItem[]
  meta: PaginationMeta
}

export const COUNTERPARTY_SORT_FIELDS = [
  'businessName',
  'nit',
  'status',
  'registrationDate',
  'lastFollowUpDate',
  'nextFollowUpDate',
] as const

export type CounterpartySortField =
  (typeof COUNTERPARTY_SORT_FIELDS)[number]

export type SortDirection = 'asc' | 'desc'

export type CounterpartyQuery = {
  search?: string
  category?: string
  subprocessId?: string
  status?: CounterpartyStatus
  calendarStatus?: CalendarStatus
  sort?: CounterpartySortField
  dir?: SortDirection
  page?: number
  pageSize?: number
}

export type EvaluateRiskInput = {
  decision: 'CONTINUE' | 'ARCHIVE'
  evaluatedAt?: string
  notes?: string
}

export type ReactivateCounterpartyInput = {
  reason: string
  nextFollowUpDate?: string
}

export type CounterpartySyncResult = {
  sourceRows: number
  followUpRows: number
  created: number
  alreadyExisting: number
  skippedInvalid: number
}

export type ArriendosSyncResult = CounterpartySyncResult
