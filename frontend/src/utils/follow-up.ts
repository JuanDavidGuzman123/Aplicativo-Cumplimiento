import type { FollowUpStatus } from '../types/follow-up'
import type { BadgeTone } from '../components/Badge'

export const followUpStatusLabels: Record<FollowUpStatus, string> = {
  DRAFT: 'En proceso',
  FINALIZED: 'Finalizado',
}

export const followUpStatusTones: Record<FollowUpStatus, BadgeTone> = {
  DRAFT: 'amber',
  FINALIZED: 'green',
}
