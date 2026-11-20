export type CounterpartyStatus = 'ACTIVE' | 'ARCHIVED'

export type CalendarStatus =
  | 'OVERDUE'
  | 'PENDING'
  | 'UPCOMING'
  | 'ON_TIME'
  | 'UNSCHEDULED'

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
  subprocess: CounterpartySubprocess
}

export type RelatedUser = {
  id: string
  name: string
  email: string
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

export type CreateCounterpartyInput = {
  nit: string
  businessName: string
  subprocessId: string
  observations?: string
  registrationDate?: string
  nextFollowUpDate?: string
}

export type UpdateCounterpartyInput = {
  nit?: string
  businessName?: string
  subprocessId?: string
  observations?: string | null
}

export type CounterpartyQuery = {
  search?: string
  subprocessId?: string
  status?: CounterpartyStatus
  calendarStatus?: CalendarStatus
  page?: number
  pageSize?: number
}
