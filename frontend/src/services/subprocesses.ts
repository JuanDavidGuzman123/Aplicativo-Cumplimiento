import { api } from './api'
import type { Subprocess } from '../types/subprocess'

export type CreateSubprocessInput = {
  name: string
  description?: string
}

export type UpdateSubprocessInput = {
  name?: string
  description?: string | null
  active?: boolean
}

export async function getSubprocesses(): Promise<Subprocess[]> {
  const { data } = await api.get<Subprocess[]>('/subprocesses')
  return data
}

export async function createSubprocess(
  input: CreateSubprocessInput,
): Promise<Subprocess> {
  const { data } = await api.post<Subprocess>('/subprocesses', input)
  return data
}

export async function updateSubprocess(
  id: string,
  input: UpdateSubprocessInput,
): Promise<Subprocess> {
  const { data } = await api.patch<Subprocess>(
    `/subprocesses/${id}`,
    input,
  )
  return data
}
