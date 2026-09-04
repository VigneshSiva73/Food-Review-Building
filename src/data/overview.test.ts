import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEAL_TYPES } from '@/types'
import { runPipeline } from './pipeline'
import {
  datasetOverview,
  floorStatistics,
  mealStatistics,
  pillarStatistics,
} from './overview'

const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
const dataset = runPipeline(csvText)
const overview = datasetOverview(dataset.days)

describe('datasetOverview', () => {
  it('agrees with the pipeline on the numbers they both count', () => {
    // Two summaries of the same days, written for different readers. They are
    // allowed to say different things; they are not allowed to disagree.
    expect(overview.days).toBe(dataset.stats.totalDays)
    expect(overview.meals).toBe(dataset.stats.totalRecords)
    expect(overview.range).toEqual(dataset.stats.dateRange)
    for (const { meal, average, count } of overview.averages) {
      expect(`${meal}:${count}`).toBe(`${meal}:${dataset.stats.perMeal[meal].count}`)
      expect(average).toBeCloseTo(dataset.stats.perMeal[meal].average, 9)
    }
  })

  it('averages every meal over the whole body of reviews', () => {
    expect(overview.averages.map((a) => a.meal)).toEqual([...MEAL_TYPES])
    let sum = 0
    let n = 0
    for (const day of dataset.days) {
      for (const meal of MEAL_TYPES) {
        const review = day.meals[meal]
        if (!review) continue
        sum += review.rating
        n++
      }
    }
    expect(overview.overall).toBeCloseTo(sum / n, 9)
  })

  it('picks the best and worst building by its own average', () => {
    // A month, not a day. The pipeline already reports the best DAY, and the
    // two answers are different questions — a single outstanding lunch does
    // not make a month.
    const months = new Map<string, { sum: number; n: number }>()
    for (const day of dataset.days) {
      const key = day.date.slice(0, 7)
      const m = months.get(key) ?? { sum: 0, n: 0 }
      months.set(key, m)
      for (const meal of MEAL_TYPES) {
        const review = day.meals[meal]
        if (!review) continue
        m.sum += review.rating
        m.n++
      }
    }
    const averages = [...months.values()].filter((m) => m.n > 0).map((m) => m.sum / m.n)
    expect(overview.bestMonth!.average).toBeCloseTo(Math.max(...averages), 9)
    expect(overview.worstMonth!.average).toBeCloseTo(Math.min(...averages), 9)
    expect(overview.months).toBe(months.size)
  })

  it('judges a floor on its own meals, not on three', () => {
    // A Saturday records no dinner. Dividing its two ratings by three would
    // rank every Saturday last for a meal it was never going to serve.
    let best: { date: string; average: number } | null = null
    let worst: { date: string; average: number } | null = null
    for (const day of dataset.days) {
      let sum = 0
      let n = 0
      for (const meal of MEAL_TYPES) {
        const review = day.meals[meal]
        if (!review) continue
        sum += review.rating
        n++
      }
      if (n === 0) continue
      const entry = { date: day.date, average: sum / n }
      if (!best || entry.average > best.average) best = entry
      if (!worst || entry.average < worst.average) worst = entry
    }
    expect(overview.bestFloor!.average).toBeCloseTo(best!.average, 9)
    expect(overview.worstFloor!.average).toBeCloseTo(worst!.average, 9)
    // And it agrees with the pipeline, which asks the same question of days.
    expect(overview.bestFloor!.date).toBe(dataset.stats.bestDay!.date)
    expect(overview.worstFloor!.date).toBe(dataset.stats.worstDay!.date)
  })

  it('gives the tallest and shortest pillar a place, not just a number', () => {
    // The rating alone is a statistic. The month and the floor are what let
    // the reader go and stand in front of it, which is the point of the model.
    for (const pillar of [
      overview.tallest!,
      overview.shortest!,
      overview.bestFloor!,
      overview.worstFloor!,
    ]) {
      expect(dataset.days.some((d) => d.date === pillar.date)).toBe(true)
      expect(pillar.month).toMatch(/^[A-Z][a-z]+ \d{4}$/)
      expect(pillar.floor).toBeGreaterThan(0)
      // The floor is that day's position within its OWN month, so it can never
      // exceed the number of days that month recorded.
      const inMonth = dataset.days.filter((d) => d.date.slice(0, 7) === pillar.date.slice(0, 7))
      expect(pillar.floor).toBeLessThanOrEqual(inMonth.length)
      expect(inMonth[pillar.floor - 1].date).toBe(pillar.date)
    }

    let highest = -Infinity
    let lowest = Infinity
    for (const day of dataset.days) {
      for (const meal of MEAL_TYPES) {
        const review = day.meals[meal]
        if (!review) continue
        highest = Math.max(highest, review.rating)
        lowest = Math.min(lowest, review.rating)
      }
    }
    expect(overview.tallest!.rating).toBe(highest)
    expect(overview.shortest!.rating).toBe(lowest)
  })

  describe('attendance', () => {
    it('averages each meal over the sittings that recorded one', () => {
      // Its own denominator, not the meal count. Dividing by sittings that
      // recorded no attendance would quietly understate every average.
      for (const { meal, attendance } of overview.averages) {
        let total = 0
        let n = 0
        for (const day of dataset.days) {
          const seats = day.meals[meal]?.attendance
          if (!seats) continue
          total += seats.count
          n++
        }
        expect(`${meal}:${n > 0}`).toBe(`${meal}:true`)
        expect(attendance!.count).toBeCloseTo(total / n, 9)
      }
    })

    it('respects the funnel it was given', () => {
      // Everyone who ate was served, and everyone who reviewed ate. True of
      // every row, so true of every mean of them.
      for (const seats of [
        ...overview.averages.map((a) => a.attendance!),
        overview.perDay!,
        overview.perMonth!,
        overview.totals!,
      ]) {
        expect(seats.consumed).toBeLessThanOrEqual(seats.count)
        expect(seats.reviewed).toBeLessThanOrEqual(seats.consumed)
      }
    })

    it('counts a day across its sittings, not at one of them', () => {
      // Three meals a day is three chances to be counted, so a floor's figure
      // is larger than any single meal's — and a month's larger again.
      const biggestMeal = Math.max(...overview.averages.map((a) => a.attendance!.count))
      expect(overview.perDay!.count).toBeGreaterThan(biggestMeal)
      expect(overview.perMonth!.count).toBeGreaterThan(overview.perDay!.count)
    })

    it('stays inside the seats a sitting has', () => {
      // Every recorded count is clamped into range by the pipeline, so no mean
      // of them can escape it either.
      for (const { attendance } of overview.averages) {
        expect(attendance!.count).toBeGreaterThanOrEqual(60)
        expect(attendance!.count).toBeLessThanOrEqual(150)
      }
    })

    it('reports nothing at all for a dataset that records none', () => {
      const bare = dataset.days.map((d) => ({
        ...d,
        meals: Object.fromEntries(
          Object.entries(d.meals).map(([meal, review]) => [
            meal,
            { ...review, attendance: undefined },
          ]),
        ),
      }))
      const none = datasetOverview(bare)
      expect(none.perDay).toBeNull()
      expect(none.perMonth).toBeNull()
      expect(none.totals).toBeNull()
      expect(none.averages.every((a) => a.attendance === null)).toBe(true)
      // And the ratings are untouched — the two are independent.
      expect(none.overall).toBeCloseTo(overview.overall!, 9)
    })
  })

  it('says nothing rather than zero when there is nothing to say', () => {
    // An empty dataset has no best month and no average — reporting 0.000
    // would read as a month where every meal was terrible.
    const empty = datasetOverview([])
    expect(empty.overall).toBeNull()
    expect(empty.bestMonth).toBeNull()
    expect(empty.worstMonth).toBeNull()
    expect(empty.tallest).toBeNull()
    expect(empty.bestFloor).toBeNull()
    expect(empty.worstFloor).toBeNull()
    expect(empty.range).toBeNull()
    expect(empty.months).toBe(0)
    expect(empty.totals).toBeNull()
  })
})

describe('floorStatistics', () => {
  const day = dataset.days.find((d) => d.date === '2025-08-01')!
  const saturday = dataset.days.find((d) => d.weekday === 6)!
  const stats = floorStatistics(day)

  it('names the day it is', () => {
    expect(stats.date).toBe('2025-08-01')
    expect(stats.year).toBe(2025)
    expect(stats.month).toBe('August')
  })

  it('lists the meals in the solver\'s corner order', () => {
    // The card reads pillar by pillar round the plan, so the order is the
    // building's, not the data's.
    expect(stats.meals.map((m) => m.meal)).toEqual([...MEAL_TYPES])
  })

  it('ranks the same three by height', () => {
    // What the floor looks like from outside. Without it the reader has to
    // sort three numbers to see what is in front of them.
    const heights = stats.ranked.map((m) => m.rating ?? -Infinity)
    expect([...heights].sort((a, b) => b - a)).toEqual(heights)
    expect(new Set(stats.ranked.map((m) => m.meal)).size).toBe(3)
  })

  it('averages only the meals that were rated', () => {
    const rated = stats.meals.filter((m) => m.rating !== null)
    expect(stats.average).toBeCloseTo(
      rated.reduce((t, m) => t + m.rating!, 0) / rated.length,
      9,
    )
  })

  it('sums the day across its sittings', () => {
    const seated = stats.meals.filter((m) => m.attendance)
    expect(stats.totals!.count).toBe(
      seated.reduce((t, m) => t + m.attendance!.count, 0),
    )
    expect(stats.totals!.consumed).toBeLessThanOrEqual(stats.totals!.count)
    expect(stats.totals!.reviewed).toBeLessThanOrEqual(stats.totals!.consumed)
  })

  it('keeps an unserved corner in its place, and last by height', () => {
    // A Saturday has no dinner. That corner is a support post, not a nought:
    // it still carries the plate, so it keeps its place in the plan and sorts
    // below every rated meal rather than under them all at zero.
    const sat = floorStatistics(saturday)
    expect(sat.meals.map((m) => m.meal)).toEqual([...MEAL_TYPES])
    expect(sat.meals.find((m) => m.meal === 'Dinner')!.rating).toBeNull()
    expect(sat.ranked[sat.ranked.length - 1].rating).toBeNull()
    // And it is left out of the average rather than dragging it down.
    expect(sat.average).toBeGreaterThan(0)
  })
})

describe('pillarStatistics', () => {
  const day = dataset.days.find((d) => d.date === '2025-08-01')!
  const saturday = dataset.days.find((d) => d.weekday === 6 && !d.meals.Dinner)!

  it('reports the record as written, without averaging it', () => {
    // A pillar IS one row of the file. Every other card in the family is a
    // mean of something; this one must not be, or a rating the reader can
    // check against the CSV stops matching it.
    const stats = pillarStatistics(day, 'Lunch')
    const review = day.meals.Lunch!
    expect(stats.rating).toBe(review.rating)
    expect(stats.vendor).toBe(review.vendor)
    expect(stats.attendance).toEqual(review.attendance)
  })

  it('names the day and the meal it stands on', () => {
    const stats = pillarStatistics(day, 'Breakfast')
    expect(stats.date).toBe('2025-08-01')
    expect(stats.year).toBe(2025)
    expect(stats.month).toBe('August')
    expect(stats.meal).toBe('Breakfast')
    expect(stats.weekday).toBe(day.weekday)
  })

  it('agrees with the floor it is one third of', () => {
    // Two readings of the same sitting. They may report different things;
    // they may not report different numbers.
    const floor = floorStatistics(day)
    for (const meal of MEAL_TYPES) {
      const pillar = pillarStatistics(day, meal)
      const corner = floor.meals.find((m) => m.meal === meal)!
      expect(`${meal}:${pillar.rating}`).toBe(`${meal}:${corner.rating}`)
      expect(pillar.attendance).toEqual(corner.attendance)
    }
  })

  it('reports an unserved sitting as absent in every field', () => {
    // Not as zeroes. Nobody served dinner is a different claim from a vendor
    // who served nothing to nought people, and the card renders the second as
    // figures.
    const stats = pillarStatistics(saturday, 'Dinner')
    expect(stats.rating).toBeNull()
    expect(stats.vendor).toBeNull()
    expect(stats.attendance).toBeNull()
    // And it carries the weekday, which is the only thing that separates a
    // closed kitchen from a gap in the data.
    expect(stats.weekday).toBe(6)
  })
})

describe('mealStatistics', () => {
  const august = dataset.days.filter((d) => d.date.startsWith('2025-08'))
  const lunch = mealStatistics(august, 'Lunch')
  const dinner = mealStatistics(august, 'Dinner')

  it('counts the sittings the meal was served at, not the month\'s floors', () => {
    // Every day serves lunch; Saturdays serve no dinner. A column stands the
    // height of the building but only where there was a meal to measure.
    const served = august.filter((d) => d.meals.Lunch).length
    expect(lunch.pillars).toBe(served)
    expect(dinner.pillars).toBeLessThan(august.length)
  })

  it('averages the column over its own pillars', () => {
    const rated = august.flatMap((d) => (d.meals.Lunch ? [d.meals.Lunch.rating] : []))
    expect(lunch.average).toBeCloseTo(rated.reduce((t, r) => t + r, 0) / rated.length, 9)
  })

  it('places its extremes on floors of this building', () => {
    // The floor number is a position in the month on screen, so it is counted
    // as the month is walked — and the day at that position must be the day
    // the extreme came from.
    for (const at of [lunch.tallest!, lunch.shortest!]) {
      expect(august[at.floor - 1].date).toBe(at.date)
      expect(august[at.floor - 1].meals.Lunch!.rating).toBe(at.rating)
    }
    expect(lunch.tallest!.rating).toBeGreaterThanOrEqual(lunch.shortest!.rating)
  })

  it('tallies every vendor that served it, busiest first', () => {
    const counts = new Map<string, number>()
    for (const day of august) {
      const review = day.meals.Lunch
      if (!review) continue
      counts.set(review.vendor, (counts.get(review.vendor) ?? 0) + 1)
    }
    expect(lunch.vendors.map((v) => v.vendor).sort()).toEqual([...counts.keys()].sort())
    for (const v of lunch.vendors) expect(v.count).toBe(counts.get(v.vendor))
    // Ordered, and the order is stable: busiest first, ties by name.
    const order = lunch.vendors.map((v) => v.count)
    expect([...order].sort((a, b) => b - a)).toEqual(order)
    // Every sitting is accounted for exactly once.
    expect(lunch.vendors.reduce((t, v) => t + v.count, 0)).toBe(lunch.pillars)
  })

  it('gives each vendor its own average, not the column\'s', () => {
    for (const v of lunch.vendors) {
      const theirs = august.flatMap((d) =>
        d.meals.Lunch?.vendor === v.vendor ? [d.meals.Lunch.rating] : [],
      )
      expect(v.average).toBeCloseTo(theirs.reduce((t, r) => t + r, 0) / theirs.length, 9)
    }
  })

  it('reports attendance per sitting and in total', () => {
    const seated = august.flatMap((d) => (d.meals.Lunch?.attendance ? [d.meals.Lunch.attendance] : []))
    expect(lunch.totals!.count).toBe(seated.reduce((t, a) => t + a.count, 0))
    expect(lunch.attendance!.count).toBeCloseTo(lunch.totals!.count / seated.length, 9)
    // The funnel holds, as it does everywhere else.
    expect(lunch.totals!.reviewed).toBeLessThanOrEqual(lunch.totals!.consumed)
    expect(lunch.totals!.consumed).toBeLessThanOrEqual(lunch.totals!.count)
  })

  it('agrees with the building it is a third of', () => {
    // Same days, same meal, two summaries. They may report different things;
    // they may not report different numbers.
    const overall = datasetOverview(august)
    const fromBuilding = overall.averages.find((a) => a.meal === 'Lunch')!
    expect(lunch.average).toBeCloseTo(fromBuilding.average, 9)
    expect(lunch.pillars).toBe(fromBuilding.count)
    expect(lunch.attendance!.count).toBeCloseTo(fromBuilding.attendance!.count, 9)
  })

  it('says nothing rather than zero for a meal never served', () => {
    const none = mealStatistics(august.map((d) => ({ ...d, meals: {} })), 'Lunch')
    expect(none.pillars).toBe(0)
    expect(none.average).toBeNull()
    expect(none.tallest).toBeNull()
    expect(none.vendors).toEqual([])
    expect(none.totals).toBeNull()
  })
})
