import { api } from './api'
import type {
  CreateFollowUpInput,
  FinalizeFollowUpInput,
  FollowUp,
  FollowUpDocument,
  UpdateFollowUpInput,
} from '../types/follow-up'

export async function getFollowUps(
  counterpartyId: string,
): Promise<FollowUp[]> {
  const { data } = await api.get<FollowUp[]>(
    `/counterparties/${counterpartyId}/follow-ups`,
  )
  return data
}

export async function createFollowUp(
  counterpartyId: string,
  input: CreateFollowUpInput,
): Promise<FollowUp> {
  const { data } = await api.post<FollowUp>(
    `/counterparties/${counterpartyId}/follow-ups`,
    input,
  )
  return data
}

export async function updateFollowUp(
  id: string,
  input: UpdateFollowUpInput,
): Promise<FollowUp> {
  const { data } = await api.patch<FollowUp>(
    `/follow-ups/${id}`,
    input,
  )
  return data
}

export async function finalizeFollowUp(
  id: string,
  input: FinalizeFollowUpInput,
): Promise<FollowUp> {
  const { data } = await api.post<FollowUp>(
    `/follow-ups/${id}/finalize`,
    input,
  )
  return data
}

export async function uploadFollowUpDocument(
  followUpId: string,
  file: File,
): Promise<FollowUpDocument> {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post<FollowUpDocument>(
    `/follow-ups/${followUpId}/documents`,
    formData,
  )
  return data
}

export async function downloadFollowUpDocument(
  documentId: string,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `/documents/${documentId}/download`,
    { responseType: 'blob' },
  )
  return data
}
