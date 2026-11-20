import { api } from './api'
import type {
  CounterpartyDetail,
  CounterpartyListResponse,
  CounterpartyQuery,
  CreateCounterpartyInput,
  UpdateCounterpartyInput,
} from '../types/counterparty'

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

export async function createCounterparty(
  input: CreateCounterpartyInput,
): Promise<CounterpartyDetail> {
  const { data } = await api.post<CounterpartyDetail>(
    '/counterparties',
    input,
  )
  return data
}

export async function updateCounterparty(
  id: string,
  input: UpdateCounterpartyInput,
): Promise<CounterpartyDetail> {
  const { data } = await api.patch<CounterpartyDetail>(
    `/counterparties/${id}`,
    input,
  )
  return data
}

export async function archiveCounterparty(
  id: string,
  reason: string,
): Promise<CounterpartyDetail> {
  const { data } = await api.post<CounterpartyDetail>(
    `/counterparties/${id}/archive`,
    { reason },
  )
  return data
}

export async function reactivateCounterparty(
  id: string,
  reason: string,
  nextFollowUpDate?: string,
): Promise<CounterpartyDetail> {
  const { data } = await api.post<CounterpartyDetail>(
    `/counterparties/${id}/reactivate`,
    { reason, nextFollowUpDate },
  )
  return data
}
