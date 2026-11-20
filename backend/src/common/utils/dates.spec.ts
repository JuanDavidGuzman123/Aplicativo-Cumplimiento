import { describe, expect, it } from 'vitest'
import {
  addMonths,
  getBusinessToday,
  parseDateOnly,
  toDateOnly,
} from './dates.js'

describe('dates', () => {
  it('calculates the business date in America/Bogota', () => {
    const now = new Date('2026-11-04T02:00:00.000Z')
    expect(toDateOnly(getBusinessToday(now))).toBe('2026-11-03')
  })

  it('adds months keeping the last valid day of the month', () => {
    expect(
      toDateOnly(addMonths(parseDateOnly('2026-08-31'), 6)),
    ).toBe('2027-02-28')
    expect(
      toDateOnly(addMonths(parseDateOnly('2023-08-31'), 6)),
    ).toBe('2024-02-29')
  })
})
