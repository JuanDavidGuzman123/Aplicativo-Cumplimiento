const BUSINESS_TIME_ZONE = 'America/Bogota'
const DAY_IN_MS = 24 * 60 * 60 * 1000

const businessDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function datePart(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((part) => part.type === type)?.value)
}

export function getBusinessToday(now = new Date()): Date {
  const parts = businessDateFormatter.formatToParts(now)
  const year = datePart(parts, 'year')
  const month = datePart(parts, 'month')
  const day = datePart(parts, 'day')

  return new Date(Date.UTC(year, month - 1, day))
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MS)
}

export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const targetMonth = month + months
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0),
  ).getUTCDate()

  return new Date(
    Date.UTC(year, targetMonth, Math.min(day, lastDayOfTargetMonth)),
  )
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function toDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}
