import type { BadgeTone } from '../components/Badge'
import type {
  AnnualNotificationType,
  FollowUpNotificationType,
} from '../types/notification'

export const followUpNotificationTypeLabels: Record<
  FollowUpNotificationType,
  string
> = {
  D30: 'Próximo',
  D15: 'Prioritario',
  DUE: 'Vence hoy',
  OVERDUE: 'Vencido',
}

export const annualNotificationTypeLabels: Record<
  AnnualNotificationType,
  string
> = {
  ANNUAL_D15: 'Anual 15 días',
  ANNUAL_D10: 'Anual 10 días',
  ANNUAL_D5: 'Anual 5 días',
  ANNUAL_D3: 'Anual 3 días',
  ANNUAL_D1: 'Anual 1 día',
}

export const followUpNotificationTypeTones: Record<
  FollowUpNotificationType,
  BadgeTone
> = {
  D30: 'blue',
  D15: 'amber',
  DUE: 'amber',
  OVERDUE: 'red',
}

export const annualNotificationTypeTones: Record<
  AnnualNotificationType,
  BadgeTone
> = {
  ANNUAL_D15: 'blue',
  ANNUAL_D10: 'amber',
  ANNUAL_D5: 'red',
  ANNUAL_D3: 'amber',
  ANNUAL_D1: 'red',
}
