import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '@/data/pipeline'
import { sameRef } from '@/types/selection'
import { buildLayout } from './layoutSolver'
import { daysForMonth } from './monthFilter'
import {
  buildingSummary,
  mealSummary,
  resolveSelection,
  tooltipText,
  weekdayName,
} from './selection'

const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
const dataset = runPipeline(csvText)
const layout = buildLayout(dataset.days)

describe('resolveSelection', () => {
  it('resolves a pillar ref to the exact CSV row values', () => {
    // CSV row 2: "01/01/2025,Lunch,2.424,Smith" → floor 0, corner 1.
    const info = resolveSelection(layout, { kind: 'pillar', floorIndex: 0, corner: 1 })
    expect(info?.kind).toBe('pillar')
    if (info?.kind !== 'pillar') return
    expect(info.floor.date).toBe('2025-01-01')
    expect(info.pillar.meta).toMatchObject({
      mealType: 'Lunch',
      rating: 2.424,
      vendor: 'Smith',
      isData: true,
      floorIndex: 0,
    })
  })

  it('resolves a Saturday Dinner corner to the non-data support', () => {
    const saturday = layout.floors.find((f) => f.availableMeals.length === 2)!
    const info = resolveSelection(layout, {
      kind: 'pillar',
      floorIndex: saturday.floorIndex,
      corner: 2,
    })
    expect(info?.kind).toBe('pillar')
    if (info?.kind !== 'pillar') return
    expect(info.pillar.isData).toBe(false)
    expect(info.pillar.meta.rating).toBeUndefined()
    expect(info.pillar.mealType).toBe('Dinner')
  })

  it('resolves floor refs, and rejects out-of-range refs', () => {
    const floor = resolveSelection(layout, { kind: 'floor', floorIndex: 64 })
    expect(floor?.kind).toBe('floor')
    expect(resolveSelection(layout, { kind: 'floor', floorIndex: 999 })).toBeNull()
    expect(resolveSelection(layout, null)).toBeNull()
  })
})

describe('sameRef', () => {
  it('compares refs structurally', () => {
    expect(sameRef({ kind: 'pillar', floorIndex: 1, corner: 2 }, { kind: 'pillar', floorIndex: 1, corner: 2 })).toBe(true)
    expect(sameRef({ kind: 'pillar', floorIndex: 1, corner: 2 }, { kind: 'pillar', floorIndex: 1, corner: 1 })).toBe(false)
    expect(sameRef({ kind: 'floor', floorIndex: 1 }, { kind: 'pillar', floorIndex: 1, corner: 0 })).toBe(false)
    expect(sameRef(null, null)).toBe(true)
    expect(sameRef({ kind: 'floor', floorIndex: 0 }, null)).toBe(false)
  })
})

describe('weekdayName', () => {
  it('names weekdays', () => {
    expect(weekdayName(0)).toBe('Sunday')
    expect(weekdayName(6)).toBe('Saturday')
  })
})

describe('tooltipText', () => {
  const at = (ref: Parameters<typeof resolveSelection>[1]) =>
    tooltipText(resolveSelection(layout, ref))

  it('summarises a rated pillar with meal, rating, vendor and date', () => {
    // CSV row 2: "01/01/2025,Lunch,2.424,Smith".
    expect(at({ kind: 'pillar', floorIndex: 0, corner: 1 })).toEqual({
      title: 'Lunch · 2.424',
      subtitle: 'Smith · Wed 01/01/2025',
    })
  })

  it('never invents a rating for a Saturday support post', () => {
    const saturday = layout.floors.find((f) => f.availableMeals.length === 2)!
    const text = at({ kind: 'pillar', floorIndex: saturday.floorIndex, corner: 2 })!
    expect(text.title).toBe('Dinner — no service')
    expect(text.subtitle).toMatch(/^Sat /)
    expect(`${text.title}${text.subtitle}`).not.toMatch(/\d\.\d/)
  })

  it('summarises a floor with its date and per-meal ratings', () => {
    const text = at({ kind: 'floor', floorIndex: 0 })!
    expect(text.title).toBe('Wed 01/01/2025')
    expect(text.subtitle).toMatch(/^Floor 1 · B \d\.\d · L \d\.\d · D \d\.\d$/)
  })

  it('returns null when nothing is hovered', () => {
    expect(tooltipText(null)).toBeNull()
  })
})

describe('the building as a whole', () => {
  const august = buildLayout(daysForMonth(dataset.days, { year: 2025, month: 8 }))

  it('averages over the ratings that exist, not over the places one could be', () => {
    // Dividing by floors times three is the easy mistake and it understates
    // every month: a Saturday has no dinner and a missing record has no
    // pillar, so the denominator is the count of measurements.
    const summary = buildingSummary(august)
    expect(summary.mealCount).toBeLessThan(summary.floorCount * 3)

    let sum = 0
    let n = 0
    for (const floor of august.floors) {
      for (const p of floor.pillars) {
        if (!p.meta.isData || p.meta.rating === undefined) continue
        sum += p.meta.rating
        n++
      }
    }
    expect(summary.mealCount).toBe(n)
    expect(summary.overall).toBeCloseTo(sum / n, 9)
  })

  it('names the month it is', () => {
    expect(buildingSummary(august).monthLabel).toBe('August 2025')
  })

  it('reports every meal, and says so when one has no data', () => {
    const summary = buildingSummary(august)
    expect(summary.averages.map((a) => a.meal)).toEqual(['Breakfast', 'Lunch', 'Dinner'])
    const empty = buildingSummary({ ...august, floors: [] })
    expect(empty.overall).toBeNull()
    expect(empty.averages.every((a) => a.rating === null)).toBe(true)
  })

  it('summarises the month beside the cursor, in more than two lines', () => {
    // The only tooltip that gets extra lines. A floor or a pillar stays at
    // two, because a card that grows while the pointer is still moving is
    // harder to read than a smaller one that does not.
    const text = tooltipText(resolveSelection(august, { kind: 'building' }))!
    expect(text.title).toBe('August 2025')
    expect(text.subtitle).toMatch(/25 floors/)
    expect(text.details).toHaveLength(4)
    expect(text.details![0]).toMatch(/^Breakfast · \d\.\d{3}$/)
    expect(text.details![3]).toMatch(/^All meals · \d\.\d{3}$/)

    // And the parts of the building still do not.
    expect(tooltipText(resolveSelection(august, { kind: 'floor', floorIndex: 0 }))!.details)
      .toBeUndefined()
  })

  it('resolves to nothing when the month is empty', () => {
    // Better than a summary of dashes.
    expect(resolveSelection({ ...august, floors: [] }, { kind: 'building' })).toBeNull()
  })
})

describe('one meal, all month', () => {
  const august = buildLayout(daysForMonth(dataset.days, { year: 2025, month: 8 }))

  it('reads one corner all the way up, and nothing else', () => {
    // A rib stands over one column, and that column carries one meal on every
    // floor. Counting the other two in would answer a question nobody asked.
    for (const corner of [0, 1, 2] as const) {
      const summary = mealSummary(august, corner)
      let sum = 0
      let n = 0
      for (const floor of august.floors) {
        const { isData, rating } = floor.pillars[corner].meta
        if (!isData || rating === undefined) continue
        sum += rating
        n++
      }
      expect(`${summary.meal}:${summary.count}`).toBe(`${summary.meal}:${n}`)
      expect(summary.average).toBeCloseTo(sum / n, 9)
    }
  })

  it('names the corner\'s own meal, in the solver\'s order', () => {
    // Corner order is a contract: 0 Breakfast, 1 Lunch, 2 Dinner, on every
    // floor and in the crown's three ribs alike. Getting it wrong here reports
    // the wrong meal for the rib under the cursor and looks entirely plausible.
    expect([0, 1, 2].map((c) => mealSummary(august, c as 0 | 1 | 2).meal)).toEqual([
      'Breakfast',
      'Lunch',
      'Dinner',
    ])
  })

  it('finds the best and worst day for that meal', () => {
    const summary = mealSummary(august, 1)
    expect(summary.best!.rating).toBeGreaterThanOrEqual(summary.worst!.rating)
    for (const floor of august.floors) {
      const { isData, rating } = floor.pillars[1].meta
      if (!isData || rating === undefined) continue
      expect(rating).toBeLessThanOrEqual(summary.best!.rating)
      expect(rating).toBeGreaterThanOrEqual(summary.worst!.rating)
    }
  })

  it('summarises that meal\'s month beside the cursor', () => {
    const text = tooltipText(resolveSelection(august, { kind: 'meal', corner: 1 }))!
    expect(text.title).toBe('Lunch · August 2025')
    expect(text.subtitle).toMatch(/^\d+ rated · avg \d\.\d{3}$/)
    expect(text.details).toHaveLength(2)
    expect(text.details![0]).toMatch(/^Best · \w{3} \d{2}\/\d{2}\/\d{4} · \d\.\d{3}$/)
  })

  it('says nothing about a meal in an empty month', () => {
    const empty = { ...august, floors: [] }
    expect(resolveSelection(empty, { kind: 'meal', corner: 0 })).toBeNull()
    expect(mealSummary(empty, 0).average).toBeNull()
    expect(mealSummary(empty, 0).best).toBeNull()
  })
})
