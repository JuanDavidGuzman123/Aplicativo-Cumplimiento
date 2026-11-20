import type {
  DashboardAttentionResponse,
  DashboardSummary,
} from '../types/dashboard'
import { api } from './api'

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary')
  return data
}

export async function getDashboardAttention(
  page = 1,
  pageSize = 10,
): Promise<DashboardAttentionResponse> {
  const { data } = await api.get<DashboardAttentionResponse>(
    '/dashboard/attention',
    { params: { page, pageSize } },
  )
  return data
}
