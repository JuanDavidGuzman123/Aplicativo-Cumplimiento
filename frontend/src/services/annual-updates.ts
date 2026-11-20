import { api } from './api'
import type {
  AnnualImportMapping,
  AnnualImportPreview,
  AnnualImportResult,
  AnnualUpdateListParams,
  AnnualUpdateListResponse,
  AnnualUpdateSummary,
  AnnualUpdatesDueResponse,
} from '../types/annual-updates'

export async function getAnnualSummary(): Promise<AnnualUpdateSummary> {
  const { data } = await api.get<AnnualUpdateSummary>(
    '/annual-updates/summary',
  )
  return data
}

export async function getAnnualUpdates(
  params: AnnualUpdateListParams,
): Promise<AnnualUpdateListResponse> {
  const query = Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== '' && value !== undefined,
    ),
  )

  const { data } = await api.get<AnnualUpdateListResponse>(
    '/annual-updates',
    { params: query },
  )
  return data
}

export async function getAnnualUpdatesDue(
  params: { page?: number; pageSize?: number } = {},
): Promise<AnnualUpdatesDueResponse> {
  const { data } = await api.get<AnnualUpdatesDueResponse>(
    '/annual-updates/updates-due',
    { params },
  )
  return data
}

function annualFormData(
  file: File,
  mapping?: AnnualImportMapping,
): FormData {
  const formData = new FormData()
  formData.append('file', file)

  if (mapping) {
    formData.append('mapping', JSON.stringify(mapping))
  }

  return formData
}

export async function previewAnnualImport(
  file: File,
  mapping?: AnnualImportMapping,
): Promise<AnnualImportPreview> {
  const { data } = await api.post<AnnualImportPreview>(
    '/annual-updates/import/preview',
    annualFormData(file, mapping),
  )
  return data
}

export async function confirmAnnualImport(
  file: File,
  mapping?: AnnualImportMapping,
): Promise<AnnualImportResult> {
  const { data } = await api.post<AnnualImportResult>(
    '/annual-updates/import/confirm',
    annualFormData(file, mapping),
  )
  return data
}
