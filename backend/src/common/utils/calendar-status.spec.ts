import { describe, expect, it } from 'vitest'
import { calculateCalendarStatus } from './calendar-status.js'
import { parseDateOnly } from './dates.js'

describe('calculateCalendarStatus', () => {
  const today = parseDateOnly('2026-11-03')

  it('returns unscheduled when there is no next follow-up date', () => {
    expect(calculateCalendarStatus(null, today)).toBe('UNSCHEDULED')
  })

  it('returns overdue for a past date', () => {
    expect(calculateCalendarStatus(parseDateOnly('2026-11-02'), today)).toBe(
      'OVERDUE',
    )
  })

  it('uses the pending range from 0 to 15 days', () => {
    expect(calculateCalendarStatus(parseDateOnly('2026-11-03'), today)).toBe(
      'PENDING',
    )
    expect(calculateCalendarStatus(parseDateOnly('2026-11-18'), today)).toBe(
      'PENDING',
    )
  })

  it('uses the upcoming range from 16 to 30 days', () => {
    expect(calculateCalendarStatus(parseDateOnly('2026-11-19'), today)).toBe(
      'UPCOMING',
    )
    expect(calculateCalendarStatus(parseDateOnly('2026-12-03'), today)).toBe(
      'UPCOMING',
    )
  })

  it('returns on time after 30 days', () => {
    expect(calculateCalendarStatus(parseDateOnly('2026-12-04'), today)).toBe(
      'ON_TIME',
    )
  })
})
