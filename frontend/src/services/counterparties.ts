import { api } from './api'
import type {
  CategorySummary,
  CounterpartySyncResult,
  CounterpartyDetail,
  CounterpartyListResponse,
  CounterpartyQuery,
  EvaluateRiskInput,
  ReactivateCounterpartyInput,
} from '../types/counterparty'

export async function syncArriendosFromExternal(): Promise<CounterpartySyncResult> {
  const { data } = await api.post<CounterpartySyncResult>(
    '/counterparties/sync-arriendos',
  )

  return data
}

export async function syncColocadoresFromExternal(): Promise<CounterpartySyncResult> {
  const { data } = await api.post<CounterpartySyncResult>(
    '/counterparties/sync-colocadores',
  )

  return data
}

export async function syncClientesFromExternal(): Promise<CounterpartySyncResult> {
  const { data } = await api.post<CounterpartySyncResult>(
    '/counterparties/sync-clientes',
  )

  return data
}

export async function getCategories(): Promise<CategorySummary[]> {
  const { data } = await api.get<CategorySummary[]>('/categories')
  return data
}

export async function getCounterparties(
  query: CounterpartyQuery,
): Promise<CounterpartyListResponse> {
  const { data } = await api.get<CounterpartyListResponse>(
    '/counterparties',
    { params: query },
  )

  return data
}

export async function getCounterparty(
  id: string,
): Promise<CounterpartyDetail> {
  const { data } = await api.get<CounterpartyDetail>(
    `/counterparties/${id}`,
  )

  return data
}

export async function evaluateRisk(
  id: string,
  input: EvaluateRiskInput,
): Promise<CounterpartyDetail> {
  const { data } = await api.post<CounterpartyDetail>(
    `/counterparties/${id}/risk-evaluation`,
    input,
  )

  return data
}

export async function reactivateCounterparty(
  id: string,
  input: ReactivateCounterpartyInput,
): Promise<CounterpartyDetail> {
  const { data } = await api.post<CounterpartyDetail>(
    `/counterparties/${id}/reactivate`,
    input,
  )

  return data
}
