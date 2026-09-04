import { describe, expect, it } from 'vitest'
import { runPipeline } from './index'

/**
 * Malformed-input fixtures (plan §33). The pipeline must either produce a
 * clean (possibly empty) dataset with issues logged, or throw a message the
 * UI can show — never crash, never silently drop data.
 */

const HEADER = 'date,meal type,average rating,vendor name'
const GOOD = '04/06/2026,Breakfast,3.890,John'
const BOM = '﻿'

describe('runPipeline hardening', () => {
  it('throws a readable error when a required column is missing', () => {
    expect(() => runPipeline('date,meal type\n04/06/2026,Breakfast')).toThrow(/average rating/)
  })

  it('throws on input that is not CSV at all', () => {
    expect(() => runPipeline('  not a spreadsheet')).toThrow(/not readable/i)
  })

  it('returns an empty dataset for a header-only file', () => {
    const result = runPipeline(HEADER)
    expect(result.days).toEqual([])
    expect(result.stats.totalDays).toBe(0)
    expect(result.stats.dateRange).toBeNull()
  })

  it('returns an empty dataset — with issues — when every row is invalid', () => {
    const result = runPipeline(
      [HEADER, 'nope,Breakfast,3.5,John', '04/06/2026,Brunch,3.5,John', '04/06/2026,Lunch,abc,Smith'].join('\n'),
    )
    expect(result.days).toEqual([])
    expect(result.stats.invalidRowsDropped).toBe(3)
    expect(result.issues).toHaveLength(3)
  })

  it('survives a UTF-8 BOM and CRLF line endings from spreadsheet exports', () => {
    const result = runPipeline(`${BOM}${HEADER}\r\n${GOOD}\r\n`)
    expect(result.days).toHaveLength(1)
    expect(result.days[0].meals.Breakfast?.rating).toBe(3.89)
  })

  it('ignores unknown extra columns', () => {
    const result = runPipeline(
      [`${HEADER},comment,submitted by`, `${GOOD},"too salty, again",kiosk`].join('\n'),
    )
    expect(result.days).toHaveLength(1)
    expect(result.days[0].meals.Breakfast?.vendor).toBe('John')
  })

  it('drops ragged rows without losing the good ones', () => {
    const result = runPipeline([HEADER, '04/06/2026,Lunch', GOOD].join('\n'))
    expect(result.days).toHaveLength(1)
    expect(result.days[0].meals.Breakfast).toBeDefined()
    expect(result.days[0].meals.Lunch).toBeUndefined()
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('keeps whitespace-padded fields usable', () => {
    const result = runPipeline([HEADER, '  04/06/2026 , breakfast , 3.890 , John '].join('\n'))
    expect(result.days[0].meals.Breakfast).toMatchObject({ rating: 3.89, vendor: 'John' })
  })

  it('clamps absurd ratings instead of crashing the height mapping', () => {
    const result = runPipeline(
      [HEADER, '04/06/2026,Breakfast,999,John', '05/06/2026,Breakfast,-42,John'].join('\n'),
    )
    expect(result.days[0].meals.Breakfast?.rating).toBe(5)
    expect(result.days[1].meals.Breakfast?.rating).toBe(1)
    expect(result.issues.every((i) => i.type === 'out-of-range')).toBe(true)
  })
})
