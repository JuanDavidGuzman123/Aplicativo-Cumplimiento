import { describe, expect, it } from 'vitest'
import { NIT_PATTERN, normalizeNit } from './nit.js'

describe('nit', () => {
  it('normalizes separators without changing the original value', () => {
    expect(normalizeNit('900.123.456-7')).toBe('9001234567')
    expect(normalizeNit(' 900 123 456 ')).toBe('900123456')
  })

  it('accepts between 6 and 15 digits with common separators', () => {
    expect(NIT_PATTERN.test('900.123.456-7')).toBe(true)
    expect(NIT_PATTERN.test('900123456789012')).toBe(true)
  })

  it('rejects invalid lengths and characters', () => {
    expect(NIT_PATTERN.test('12345')).toBe(false)
    expect(NIT_PATTERN.test('9001234567890123')).toBe(false)
    expect(NIT_PATTERN.test('900ABC123')).toBe(false)
  })
})
