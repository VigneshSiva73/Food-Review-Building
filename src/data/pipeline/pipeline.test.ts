import { describe, expect, it } from 'vitest'
import type { FoodReview } from '@/types'
import { applyCalendarRules } from './calendar'
import { dedupeRecords } from './dedupe'
import { groupByDate } from './group'
import { parseCsv } from './parse'
import { computeStats } from './stats'
import { validateRows } from './validate'

const HEADER = 'date,meal type,average rating,vendor name'
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n')

const review = (over: Partial<FoodReview> = {}): FoodReview => ({
  date: '2026-06-04',
  mealType: 'Breakfast',
  rating: 3.5,
  vendor: 'John',
  ...over,
})

describe('parseCsv', () => {
  it('parses rows and normalizes header case/spacing', () => {
    const { rows, parseErrors } = parseCsv(
      ['Date, Meal  Type ,AVERAGE RATING,Vendor Name', '04/06/2026,Breakfast,3.890,John'].join('\n'),
    )
    expect(parseErrors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ row: 1, date: '04/06/2026', mealType: 'Breakfast', rating: '3.890', vendor: 'John' })
  })

  it('reports missing required columns as parse errors', () => {
    const { rows, parseErrors } = parseCsv('date,meal type\n04/06/2026,Breakfast')
    expect(rows).toEqual([])
    expect(parseErrors.some((e) => e.includes('average rating'))).toBe(true)
  })

  it('skips empty lines', () => {
    const { rows } = parseCsv(csv('04/06/2026,Breakfast,3.5,John', '', '05/06/2026,Lunch,2.1,Smith'))
    expect(rows).toHaveLength(2)
  })
})

describe('validateRows', () => {
  // Attendance blank by default: it is an optional part of the format, and a
  // file that does not record it is not a malformed file.
  const raw = (over: Record<string, string> = {}, row = 1) => ({
    row,
    date: '04/06/2026',
    mealType: 'Breakfast',
    rating: '3.5',
    vendor: 'John',
    count: '',
    consumed: '',
    reviewed: '',
    ...over,
  })

  it('accepts valid rows and converts to ISO dates', () => {
    const { reviews, issues } = validateRows([raw()])
    expect(issues).toEqual([])
    expect(reviews[0]).toEqual({ date: '2026-06-04', mealType: 'Breakfast', rating: 3.5, vendor: 'John' })
  })

  it('accepts meal types case-insensitively', () => {
    const { reviews } = validateRows([raw({ mealType: 'lunch' })])
    expect(reviews[0].mealType).toBe('Lunch')
  })

  it('drops rows with invalid date / meal / rating / vendor, with issues', () => {
    const { reviews, issues } = validateRows([
      raw({ date: '31/02/2026' }, 1),
      raw({ mealType: 'Brunch' }, 2),
      raw({ rating: 'abc' }, 3),
      raw({ vendor: '' }, 4),
    ])
    expect(reviews).toEqual([])
    expect(issues).toHaveLength(4)
    expect(issues.every((i) => i.type === 'invalid-row')).toBe(true)
    expect(issues.map((i) => i.row)).toEqual([1, 2, 3, 4])
  })

  it('clamps out-of-range ratings and reports them', () => {
    const { reviews, issues } = validateRows([raw({ rating: '7.2' }), raw({ rating: '0.4' }, 2)])
    expect(reviews.map((r) => r.rating)).toEqual([5, 1])
    expect(issues.every((i) => i.type === 'out-of-range')).toBe(true)
  })

  describe('attendance', () => {
    const att = (over: Record<string, string>, row = 1) =>
      raw({ count: '120', consumed: '95', reviewed: '70', ...over }, row)

    it('reads the funnel when the file records one', () => {
      const { reviews, issues } = validateRows([att({})])
      expect(issues).toEqual([])
      expect(reviews[0].attendance).toEqual({ count: 120, consumed: 95, reviewed: 70 })
    })

    it('carries none at all when the file does not record it', () => {
      // Absent is not zero people. A dataset that predates these columns is
      // still a valid dataset, and reporting nought served would be a lie
      // about it rather than a gap in it.
      const { reviews, issues } = validateRows([raw()])
      expect(reviews[0].attendance).toBeUndefined()
      expect(issues).toEqual([])
    })

    it('clamps a count outside what a sitting can hold', () => {
      const { reviews, issues } = validateRows([
        att({ count: '400', consumed: '10', reviewed: '5' }),
        att({ count: '3', consumed: '2', reviewed: '1' }, 2),
      ])
      expect(reviews.map((r) => r.attendance!.count)).toEqual([150, 60])
      expect(issues.every((i) => i.type === 'out-of-range')).toBe(true)
    })

    it('repairs a funnel that runs backwards, downward', () => {
      // The smaller number is the one that can be trusted: you cannot eat a
      // meal nobody served, or review one you did not eat.
      const { reviews, issues } = validateRows([att({ consumed: '200', reviewed: '180' })])
      const a = reviews[0].attendance!
      expect(a.consumed).toBe(a.count)
      expect(a.reviewed).toBeLessThanOrEqual(a.consumed)
      expect(issues.length).toBeGreaterThan(0)
    })

    it('drops a half-filled row rather than half-believing it', () => {
      // Two of the three counts describe nothing on their own.
      const { reviews, issues } = validateRows([att({ reviewed: '' })])
      expect(reviews[0].attendance).toBeUndefined()
      expect(issues.some((i) => i.type === 'invalid-row')).toBe(true)
      // The review itself survives — the rating is still good.
      expect(reviews[0].rating).toBe(3.5)
    })
  })
})

describe('dedupeRecords', () => {
  it('passes unique records through untouched', () => {
    const input = [review(), review({ mealType: 'Lunch' })]
    const { reviews, issues } = dedupeRecords(input)
    expect(reviews).toEqual(input)
    expect(issues).toEqual([])
  })

  it('removes exact duplicates with a duplicate issue', () => {
    const { reviews, issues } = dedupeRecords([review(), review(), review()])
    expect(reviews).toHaveLength(1)
    expect(issues).toEqual([expect.objectContaining({ type: 'duplicate' })])
    expect(issues[0].message).toContain('2 exact duplicate')
  })

  it('resolves conflicts by strategy: first / last / average', () => {
    const conflicting = [review({ rating: 2 }), review({ rating: 4 })]
    expect(dedupeRecords(conflicting, 'first').reviews[0].rating).toBe(2)
    expect(dedupeRecords(conflicting, 'last').reviews[0].rating).toBe(4)
    expect(dedupeRecords(conflicting, 'average').reviews[0].rating).toBe(3)
    expect(dedupeRecords(conflicting, 'first').issues[0].type).toBe('conflict')
  })
})

describe('applyCalendarRules', () => {
  it('excludes records on Sundays and third Saturdays', () => {
    const { reviews, issues } = applyCalendarRules([
      review({ date: '2026-06-07' }), // Sunday
      review({ date: '2026-06-20' }), // third Saturday
      review({ date: '2026-06-05' }), // Friday — kept
    ])
    expect(reviews).toHaveLength(1)
    expect(reviews[0].date).toBe('2026-06-05')
    expect(issues).toHaveLength(2)
    expect(issues.every((i) => i.type === 'unexpected-meal')).toBe(true)
  })

  it('excludes Dinner on normal Saturdays but keeps Breakfast/Lunch', () => {
    const { reviews, issues } = applyCalendarRules([
      review({ date: '2026-06-06', mealType: 'Breakfast' }),
      review({ date: '2026-06-06', mealType: 'Lunch' }),
      review({ date: '2026-06-06', mealType: 'Dinner' }),
    ])
    expect(reviews.map((r) => r.mealType)).toEqual(['Breakfast', 'Lunch'])
    expect(issues[0].message).toContain('Dinner on a Saturday')
  })
})

describe('groupByDate', () => {
  it('groups meals per day and sorts chronologically', () => {
    const days = groupByDate([
      review({ date: '2026-06-05', mealType: 'Lunch', vendor: 'Smith' }),
      review({ date: '2026-06-04', mealType: 'Breakfast' }),
      review({ date: '2026-06-04', mealType: 'Dinner' }),
    ])
    expect(days.map((d) => d.date)).toEqual(['2026-06-04', '2026-06-05'])
    expect(Object.keys(days[0].meals).sort()).toEqual(['Breakfast', 'Dinner'])
    expect(days[0].weekday).toBe(4)
    expect(days[1].isSaturday).toBe(false)
  })
})

describe('computeStats', () => {
  it('computes totals, per-meal stats, and best/worst day', () => {
    const days = groupByDate([
      review({ date: '2026-06-04', mealType: 'Breakfast', rating: 4 }),
      review({ date: '2026-06-04', mealType: 'Lunch', rating: 2, vendor: 'Smith' }),
      review({ date: '2026-06-05', mealType: 'Breakfast', rating: 5 }),
    ])
    const stats = computeStats(days, [
      { type: 'duplicate', message: 'x' },
      { type: 'conflict', message: 'x' },
      { type: 'invalid-row', message: 'x' },
    ])
    expect(stats.totalDays).toBe(2)
    expect(stats.totalRecords).toBe(3)
    expect(stats.duplicatesRemoved).toBe(1)
    expect(stats.conflictsResolved).toBe(1)
    expect(stats.invalidRowsDropped).toBe(1)
    expect(stats.perMeal.Breakfast).toMatchObject({ count: 2, average: 4.5, min: 4, max: 5 })
    expect(stats.perMeal.Dinner).toMatchObject({ count: 0, average: 0 })
    expect(stats.bestDay).toEqual({ date: '2026-06-05', average: 5 })
    expect(stats.worstDay).toEqual({ date: '2026-06-04', average: 3 })
    expect(stats.dateRange).toEqual({ start: '2026-06-04', end: '2026-06-05' })
  })

  it('handles an empty dataset', () => {
    const stats = computeStats([], [])
    expect(stats.totalDays).toBe(0)
    expect(stats.bestDay).toBeNull()
    expect(stats.dateRange).toBeNull()
  })
})
