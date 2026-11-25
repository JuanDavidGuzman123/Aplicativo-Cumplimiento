import { AnnualNotificationType } from '@prisma/client'

export const ANNUAL_DAY_IN_MS = 24 * 60 * 60 * 1000

export type AnnualSituation =
  | 'WITHOUT_DATE'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'NOT_DUE'

export function annualDueDate(filingDate: Date | null): Date | null {
  if (!filingDate) {
    return null
  }

  const year = filingDate.getUTCFullYear() + 1
  const month = filingDate.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(filingDate.getUTCDate(), lastDay)

  return new Date(Date.UTC(year, month, day))
}

export function minimumAnnualFilingDate(currentYear: number): Date {
  return new Date(Date.UTC(currentYear - 1, 0, 1))
}

export function daysUntil(target: Date | null, today: Date): number | null {
  if (!target) {
    return null
  }

  return Math.round((target.getTime() - today.getTime()) / ANNUAL_DAY_IN_MS)
}

export function resolveAnnualReminderType(
  days: number | null,
): AnnualNotificationType | null {
  if (days === 15) {
    return AnnualNotificationType.ANNUAL_D15
  }

  if (days === 5) {
    return AnnualNotificationType.ANNUAL_D5
  }

  if (days === 1) {
    return AnnualNotificationType.ANNUAL_D1
  }

  if (days === 0) {
    return AnnualNotificationType.ANNUAL_DUE
  }

  return null
}

export function annualSituation(
  days: number | null,
): AnnualSituation {
  if (days === null) {
    return 'WITHOUT_DATE'
  }

  if (days < 0) {
    return 'OVERDUE'
  }

  if (days === 0) {
    return 'DUE_TODAY'
  }

  if (days <= 15) {
    return 'DUE_SOON'
  }

  return 'NOT_DUE'
}

export function needsAnnualUpdate(days: number | null): boolean {
  return days === null || days <= 0
}
