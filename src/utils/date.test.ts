import { describe, expect, it } from 'vitest'
import {
  isLeaveDayISO,
  isThirdSaturdayISO,
  isoDateRange,
  isoToDisplay,
  parseDDMMYYYY,
  weekdayOfISO,
} from './date'

describe('parseDDMMYYYY', () => {
  it('parses valid dates', () => {
    expect(parseDDMMYYYY('04/06/2026')).toBe('2026-06-04')
    expect(parseDDMMYYYY('21/08/2026')).toBe('2026-08-21')
  })

  it('rejects impossible calendar dates', () => {
    expect(parseDDMMYYYY('31/02/2026')).toBeNull()
    expect(parseDDMMYYYY('00/06/2026')).toBeNull()
    expect(parseDDMMYYYY('32/01/2026')).toBeNull()
  })

  it('rejects malformed strings', () => {
    expect(parseDDMMYYYY('2026-06-04')).toBeNull()
    expect(parseDDMMYYYY('4/6/2026')).toBeNull()
    expect(parseDDMMYYYY('')).toBeNull()
    expect(parseDDMMYYYY('garbage')).toBeNull()
  })
})

describe('calendar helpers', () => {
  it('round-trips display format', () => {
    expect(isoToDisplay('2026-06-04')).toBe('04/06/2026')
  })

  it('computes weekdays (4 June 2026 is a Thursday)', () => {
    expect(weekdayOfISO('2026-06-04')).toBe(4)
    expect(weekdayOfISO('2026-06-07')).toBe(0) // Sunday
    expect(weekdayOfISO('2026-06-06')).toBe(6) // Saturday
  })

  it('identifies third Saturdays of the project months', () => {
    expect(isThirdSaturdayISO('2026-06-20')).toBe(true)
    expect(isThirdSaturdayISO('2026-07-18')).toBe(true)
    expect(isThirdSaturdayISO('2026-08-15')).toBe(true)
    expect(isThirdSaturdayISO('2026-06-13')).toBe(false) // second Saturday
    expect(isThirdSaturdayISO('2026-06-27')).toBe(false) // fourth Saturday
    expect(isThirdSaturdayISO('2026-06-21')).toBe(false) // a Sunday
  })

  it('flags leave days', () => {
    expect(isLeaveDayISO('2026-06-07')).toBe(true) // Sunday
    expect(isLeaveDayISO('2026-06-20')).toBe(true) // third Saturday
    expect(isLeaveDayISO('2026-06-06')).toBe(false) // normal Saturday
    expect(isLeaveDayISO('2026-06-05')).toBe(false) // Friday
  })

  it('builds inclusive date ranges', () => {
    const range = isoDateRange('2026-06-04', '2026-06-06')
    expect(range).toEqual(['2026-06-04', '2026-06-05', '2026-06-06'])
  })
})
