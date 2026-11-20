import type { AuditListResponse, AuditQuery } from '../types/audit'
import { api } from './api'

export async function getAuditLogs(
  query: AuditQuery,
): Promise<AuditListResponse> {
  const { data } = await api.get<AuditListResponse>('/audit', {
    params: query,
  })
  return data
}
