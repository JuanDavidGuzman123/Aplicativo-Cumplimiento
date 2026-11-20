import type { RelatedUser } from './counterparty'

export type FollowUpStatus = 'DRAFT' | 'FINALIZED'

export type FollowUpDocument = {
  id: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
  uploadedBy: RelatedUser
}

export type FollowUp = {
  id: string
  counterpartyId: string
  performedAt: string
  result: string | null
  observations: string | null
  status: FollowUpStatus
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
  responsibleUser: RelatedUser
  documents: FollowUpDocument[]
}

export type CreateFollowUpInput = {
  performedAt?: string
  result?: string | null
  observations?: string | null
}

export type UpdateFollowUpInput = {
  performedAt?: string
  result?: string | null
  observations?: string | null
}

export type FinalizeFollowUpInput = {
  performedAt?: string
  result: string
  observations?: string | null
}
