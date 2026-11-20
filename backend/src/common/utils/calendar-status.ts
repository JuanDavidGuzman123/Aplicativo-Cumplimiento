import { getBusinessToday } from './dates.js'

export const CALENDAR_STATUSES = [
  'OVERDUE',
  'PENDING',
  'UPCOMING',
  'ON_TIME',
  'UNSCHEDULED',
] as const

export type CalendarStatus = (typeof CALENDAR_STATUSES)[number]

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function calculateCalendarStatus(
  nextFollowUpDate: Date | null,
  today = getBusinessToday(),
): CalendarStatus {
  if (!nextFollowUpDate) {
    return 'UNSCHEDULED'
  }

  const daysUntilFollowUp = Math.round(
    (nextFollowUpDate.getTime() - today.getTime()) / DAY_IN_MS,
  )

  if (daysUntilFollowUp < 0) {
    return 'OVERDUE'
  }

  if (daysUntilFollowUp <= 15) {
    return 'PENDING'
  }

  if (daysUntilFollowUp <= 30) {
    return 'UPCOMING'
  }

  return 'ON_TIME'
}
