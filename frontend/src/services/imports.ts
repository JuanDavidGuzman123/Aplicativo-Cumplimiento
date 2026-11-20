import { api } from './api'
import type {
  ImportBatch,
  ImportConfirmDetail,
  ImportDetail,
  ImportListResponse,
  ImportOptionsInput,
  ImportPreviewDetail,
} from '../types/import'

export async function getImports(
  page = 1,
  pageSize = 10,
): Promise<ImportListResponse> {
  const { data } = await api.get<ImportListResponse>('/imports', {
    params: { page, pageSize },
  })
  return data
}

export async function getImport(id: string): Promise<ImportDetail> {
  const { data } = await api.get<ImportDetail>(`/imports/${id}`)
  return data
}

export async function uploadImportFiles(
  files: File[],
): Promise<ImportDetail> {
  const formData = new FormData()

  for (const file of files) {
    formData.append('files', file)
  }

  const { data } = await api.post<ImportDetail>(
    '/imports/upload',
    formData,
  )
  return data
}

export async function previewImport(
  id: string,
  input: ImportOptionsInput,
): Promise<ImportPreviewDetail> {
  const { data } = await api.post<ImportPreviewDetail>(
    `/imports/${id}/preview`,
    input,
  )
  return data
}

export async function confirmImport(
  id: string,
  input: ImportOptionsInput,
): Promise<ImportConfirmDetail> {
  const { data } = await api.post<ImportConfirmDetail>(
    `/imports/${id}/confirm`,
    input,
  )
  return data
}

export type ImportHistoryItem = ImportBatch
