import type { PaginationMeta } from './counterparty'

export type AuditUser = {
  id: string
  name: string
  email: string
}

export type AuditLog = {
  id: string
  action: string
  entity: string
  entityId: string | null
  details: unknown
  createdAt: string
  user: AuditUser | null
}

export type AuditListResponse = {
  data: AuditLog[]
  meta: PaginationMeta
}

export type AuditQuery = {
  entity?: string
  action?: string
  userId?: string
  page?: number
  pageSize?: number
}
