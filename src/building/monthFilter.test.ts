import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '@/data/pipeline'
import { buildLayout } from './layoutSolver'
import {
  availableYears,
  daysForMonth,
  daysInCalendarMonth,
  lastWorkingDayOfMonth,
  monthHasData,
  monthIsComplete,
  visibleFloorCount,
} from './monthFilter'

const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
const dataset = runPipeline(csvText)

describe('availableYears / monthHasData', () => {
  it('finds exactly the years and months present in the dataset', () => {
    expect(availableYears(dataset.days)).toEqual([2025, 2026])
    // 2025 is complete; 2026 runs to the end of August and then stops.
    expect(
      [...Array(12)].map((_, i) => monthHasData(dataset.days, { year: 2025, month: i + 1 })),
    ).toEqual([true, true, true, true, true, true, true, true, true, true, true, true])
    expect(
      [...Array(12)].map((_, i) => monthHasData(dataset.days, { year: 2026, month: i + 1 })),
    ).toEqual([
      true, true, true, true, true, true, true, true, false, false, false, false,
    ])
    expect(monthHasData(dataset.days, { year: 2024, month: 6 })).toBe(false)
  })
})

describe('daysForMonth', () => {
  it('partitions the dataset exactly, in chronological order', () => {
    // Every month of the range partitions the dataset exactly.
    let total = 0
    for (const year of [2025, 2026]) {
      for (let month = 1; month <= 12; month++) {
        const slice = daysForMonth(dataset.days, { year, month })
        const prefix = `${year}-${String(month).padStart(2, '0')}`
        expect(slice.every((d) => d.date.startsWith(prefix))).toBe(true)
        const dates = slice.map((d) => d.date)
        expect([...dates].sort()).toEqual(dates)
        total += slice.length
      }
    }
    expect(total).toBe(dataset.days.length)
    expect(daysForMonth(dataset.days, { year: 2026, month: 12 })).toEqual([])
  })
})

describe('daysInCalendarMonth', () => {
  it('knows month lengths, including leap years', () => {
    expect(daysInCalendarMonth({ year: 2026, month: 6 })).toBe(30)
    expect(daysInCalendarMonth({ year: 2026, month: 8 })).toBe(31)
    expect(daysInCalendarMonth({ year: 2026, month: 2 })).toBe(28)
    expect(daysInCalendarMonth({ year: 2028, month: 2 })).toBe(29)
  })
})

describe('visibleFloorCount', () => {
  const juneLayout = buildLayout(daysForMonth(dataset.days, { year: 2026, month: 6 }))

  it('shows exactly the floors dated on or before the limit', () => {
    const count = visibleFloorCount(juneLayout.floors, 12)
    const expected = juneLayout.floors.filter((f) => Number(f.date.slice(8, 10)) <= 12).length
    expect(count).toBe(expected)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(juneLayout.floors.length)
    // The visible set is a prefix: every floor before the cut also qualifies.
    for (let i = 0; i < count; i++) {
      expect(Number(juneLayout.floors[i].date.slice(8, 10))).toBeLessThanOrEqual(12)
    }
  })

  it('null and past-end limits show everything; day 0 shows nothing', () => {
    expect(visibleFloorCount(juneLayout.floors, null)).toBe(juneLayout.floors.length)
    expect(visibleFloorCount(juneLayout.floors, 31)).toBe(juneLayout.floors.length)
    expect(visibleFloorCount(juneLayout.floors, 0)).toBe(0)
  })

  it('grows monotonically as the slider rises', () => {
    let previous = 0
    for (let day = 1; day <= 30; day++) {
      const count = visibleFloorCount(juneLayout.floors, day)
      expect(count).toBeGreaterThanOrEqual(previous)
      previous = count
    }
    expect(previous).toBe(juneLayout.floors.length)
  })
})

describe('month completeness', () => {
  it('stops at the last day a review could have been recorded', () => {
    // August 2025 ends on a Sunday, so the month is over on Saturday the 30th
    // and demanding data on the 31st would call it unfinished for ever.
    expect(lastWorkingDayOfMonth({ year: 2025, month: 8 })).toBe(30)
    // July 2025 ends on a Thursday — an ordinary working day.
    expect(lastWorkingDayOfMonth({ year: 2025, month: 7 })).toBe(31)
    // February in a leap year, to catch a hard-coded 28.
    expect(lastWorkingDayOfMonth({ year: 2024, month: 2 })).toBe(29)
  })

  it('calls every month of the dataset finished except the one still running', () => {
    // The point of the whole rule: the newest month is short because those
    // meals have not been eaten yet, and it is the only one that is.
    const unfinished = []
    for (const year of availableYears(dataset.days)) {
      for (let month = 1; month <= 12; month++) {
        const key = { year, month }
        if (!monthHasData(dataset.days, key)) continue
        if (!monthIsComplete(dataset.days, key)) unfinished.push(`${year}-${month}`)
      }
    }
    expect(unfinished).toEqual(['2026-8'])
  })

  it('tolerates a gap in the middle but not a missing end', () => {
    const august = daysForMonth(dataset.days, { year: 2025, month: 8 })
    // A missing Tuesday is a missing record, not an unfinished month.
    const gapped = august.filter((d) => !d.date.endsWith('-12'))
    expect(monthIsComplete(gapped, { year: 2025, month: 8 })).toBe(true)
    // A missing last week is.
    const truncated = august.filter((d) => Number(d.date.slice(8, 10)) <= 20)
    expect(monthIsComplete(truncated, { year: 2025, month: 8 })).toBe(false)
  })

  it('never crowns a month with no reviews at all', () => {
    expect(monthIsComplete([], { year: 2025, month: 8 })).toBe(false)
  })
})
