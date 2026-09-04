import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEAL_TYPES } from '@/types'
import { weekdayOfISO } from '@/utils/date'
import { runPipeline } from './index'

/**
 * End-to-end pipeline test against the real generated CSV
 * (public/data/food-reviews.csv, produced by `npm run generate:data`).
 */
describe('runPipeline on the generated dataset', () => {
  const csvText = readFileSync(
    join(__dirname, '../../../public/data/food-reviews.csv'),
    'utf8',
  )
  const dataset = runPipeline(csvText)

  it('produces the expected clean counts', () => {
    expect(dataset.stats.totalDays).toBe(497)
    expect(dataset.stats.totalRecords).toBe(1425)
    expect(dataset.stats.duplicatesRemoved).toBe(61)
    expect(dataset.stats.conflictsResolved).toBe(15)
    expect(dataset.stats.invalidRowsDropped).toBe(0)
  })

  it('spans the full project range in chronological order', () => {
    expect(dataset.stats.dateRange).toEqual({ start: '2025-01-01', end: '2026-08-26' })
    const dates = dataset.days.map((d) => d.date)
    expect([...dates].sort()).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('contains no leave days and no Saturday dinners', () => {
    for (const day of dataset.days) {
      expect(day.weekday).not.toBe(0)
      if (day.isSaturday) {
        expect(day.meals.Dinner).toBeUndefined()
        expect(day.meals.Breakfast).toBeDefined()
        expect(day.meals.Lunch).toBeDefined()
      } else {
        expect(Object.keys(day.meals)).toHaveLength(3)
      }
    }
    const saturdays = dataset.days.filter((d) => d.isSaturday)
    expect(saturdays).toHaveLength(66)
  })

  it('keeps every rating inside [1, 5] with correct vendors', () => {
    for (const day of dataset.days) {
      for (const meal of MEAL_TYPES) {
        const r = day.meals[meal]
        if (!r) continue
        expect(r.rating).toBeGreaterThanOrEqual(1)
        expect(r.rating).toBeLessThanOrEqual(5)
        expect(r.vendor).toBe(meal === 'Lunch' ? 'Smith' : 'John')
        expect(weekdayOfISO(r.date)).toBe(day.weekday)
      }
    }
  })
})
