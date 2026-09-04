import type { BuildingLayout, FloorLayout, MealType, PillarLayout } from '@/types'
import type { SelectionRef } from '@/types/selection'
import { isoToDisplay, weekdayOfISO } from '@/utils/date'
import { MONTH_NAMES } from './monthFilter'

/** A resolved selection, ready for UI rendering (plan §§23, 29). */
export type SelectionInfo =
  | { kind: 'pillar'; floor: FloorLayout; pillar: PillarLayout }
  | { kind: 'floor'; floor: FloorLayout }
  | { kind: 'building'; layout: BuildingLayout }
  | { kind: 'meal'; layout: BuildingLayout; corner: 0 | 1 | 2; meal: MealType }

/**
 * Corner order, and it is the solver's order — corner 0 is Breakfast, 1 Lunch,
 * 2 Dinner, on every floor and in the crown's three ribs alike. Indexing this
 * by a corner is what turns "the rib you pointed at" into "the meal".
 */
const MEALS: readonly MealType[] = ['Breakfast', 'Lunch', 'Dinner']

export function resolveSelection(
  layout: BuildingLayout,
  ref: SelectionRef | null,
): SelectionInfo | null {
  if (!ref) return null
  switch (ref.kind) {
    case 'pillar': {
      const floor = layout.floors[ref.floorIndex]
      if (!floor) return null
      return { kind: 'pillar', floor, pillar: floor.pillars[ref.corner] }
    }
    case 'floor': {
      const floor = layout.floors[ref.floorIndex]
      return floor ? { kind: 'floor', floor } : null
    }
    case 'building':
      // An empty month has no building to describe, and saying so is better
      // than a card of dashes.
      return layout.floors.length > 0 ? { kind: 'building', layout } : null
    case 'meal':
      return layout.floors.length > 0
        ? { kind: 'meal', layout, corner: ref.corner, meal: MEALS[ref.corner] }
        : null
  }
}

export interface MealAverage {
  meal: MealType
  /** null when the month recorded no rating for that meal at all. */
  rating: number | null
}

export interface MealSummary {
  meal: MealType
  /** The month this column runs through, e.g. "August 2025". */
  monthLabel: string
  count: number
  average: number | null
  best: { date: string; rating: number } | null
  worst: { date: string; rating: number } | null
}

/**
 * One meal's whole month: what the column reads, floor by floor, summed.
 *
 * The building's own answer to "how was lunch this month" — the same question
 * the side panel answers for one day, asked of the stack instead.
 */
export function mealSummary(layout: BuildingLayout, corner: 0 | 1 | 2): MealSummary {
  const meal = MEALS[corner]
  let sum = 0
  let count = 0
  let best: { date: string; rating: number } | null = null
  let worst: { date: string; rating: number } | null = null

  for (const floor of layout.floors) {
    const { isData, rating } = floor.pillars[corner].meta
    if (!isData || rating === undefined) continue
    sum += rating
    count++
    if (!best || rating > best.rating) best = { date: floor.date, rating }
    if (!worst || rating < worst.rating) worst = { date: floor.date, rating }
  }

  return {
    meal,
    monthLabel: monthLabelOf(layout),
    count,
    average: count > 0 ? sum / count : null,
    best,
    worst,
  }
}

export interface BuildingSummary {
  /** The month this building is, e.g. "August 2025". */
  monthLabel: string
  floorCount: number
  /** Rated meals across the month — not floors times three, since some are absent. */
  mealCount: number
  averages: MealAverage[]
  overall: number | null
}


/**
 * What the tower as a whole says, for the summary shown when it is pointed at
 * rather than one of its parts.
 *
 * Averaged over the pillars that actually carry a rating. Dividing by floors
 * times three is the easy mistake and it understates every month: a Saturday
 * has no dinner and a missing record has no pillar, so the denominator is the
 * count of measurements, not the count of places one could have been.
 */
function monthLabelOf(layout: BuildingLayout): string {
  const first = layout.floors[0]?.date
  return first ? `${MONTH_NAMES[Number(first.slice(5, 7)) - 1]} ${first.slice(0, 4)}` : ''
}

export function buildingSummary(layout: BuildingLayout): BuildingSummary {
  const totals = new Map<MealType, { sum: number; n: number }>()
  for (const meal of MEALS) totals.set(meal, { sum: 0, n: 0 })

  for (const floor of layout.floors) {
    for (const pillar of floor.pillars) {
      const { isData, rating, mealType } = pillar.meta
      if (!isData || rating === undefined) continue
      const bucket = totals.get(mealType)!
      bucket.sum += rating
      bucket.n++
    }
  }

  const averages = MEALS.map((meal) => {
    const { sum, n } = totals.get(meal)!
    return { meal, rating: n > 0 ? sum / n : null }
  })
  const mealCount = MEALS.reduce((t, meal) => t + totals.get(meal)!.n, 0)
  const sum = MEALS.reduce((t, meal) => t + totals.get(meal)!.sum, 0)
  return {
    monthLabel: monthLabelOf(layout),
    floorCount: layout.floors.length,
    mealCount,
    averages,
    overall: mealCount > 0 ? sum / mealCount : null,
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? ''
}

/** Three-letter weekday, for the compact hover tooltip. */
export function shortWeekday(weekday: number): string {
  return weekdayName(weekday).slice(0, 3)
}

export interface TooltipText {
  title: string
  subtitle: string
  /**
   * Extra lines under the subtitle, for the whole-building summary.
   *
   * Absent for a floor or a pillar, which is the point: a hover summary of one
   * part of the building has to stay small enough to read at a glance while
   * the pointer is still moving. Only the building itself has more to say than
   * two lines' worth.
   */
  details?: string[]
}

const MEAL_INITIAL: Record<MealType, string> = { Breakfast: 'B', Lunch: 'L', Dinner: 'D' }

/**
 * Compact two-line summary shown beside the cursor on hover (the side panel
 * carries the full detail). Pure, so the wording is unit-tested.
 */
export function tooltipText(info: SelectionInfo | null): TooltipText | null {
  if (!info) return null

  if (info.kind === 'building') {
    const s = buildingSummary(info.layout)
    return {
      title: s.monthLabel,
      subtitle: `${s.floorCount} floors · ${s.mealCount} rated meals`,
      details: [
        ...s.averages.map(
          ({ meal, rating }) => `${meal} · ${rating === null ? 'no data' : rating.toFixed(3)}`,
        ),
        `All meals · ${s.overall === null ? 'no data' : s.overall.toFixed(3)}`,
      ],
    }
  }

  if (info.kind === 'meal') {
    const s = mealSummary(info.layout, info.corner)
    const day = (d: { date: string; rating: number }) =>
      `${shortWeekday(weekdayOfISO(d.date))} ${isoToDisplay(d.date)} · ${d.rating.toFixed(3)}`
    return {
      title: `${s.meal} · ${s.monthLabel}`,
      subtitle: `${s.count} rated · avg ${s.average === null ? 'no data' : s.average.toFixed(3)}`,
      details: [
        `Best · ${s.best ? day(s.best) : 'no data'}`,
        `Worst · ${s.worst ? day(s.worst) : 'no data'}`,
      ],
    }
  }

  const { floor } = info
  const when = `${shortWeekday(weekdayOfISO(floor.date))} ${isoToDisplay(floor.date)}`

  if (info.kind === 'pillar') {
    const { meta } = info.pillar
    if (!meta.isData) {
      const saturday = weekdayOfISO(floor.date) === 6
      return {
        title: `${meta.mealType} — ${saturday ? 'no service' : 'no data'}`,
        subtitle: when,
      }
    }
    return {
      title: `${meta.mealType} · ${meta.rating?.toFixed(3)}`,
      subtitle: `${meta.vendor} · ${when}`,
    }
  }

  const meals = floor.pillars
    .filter((p) => p.meta.isData)
    .map((p) => `${MEAL_INITIAL[p.mealType]} ${p.meta.rating?.toFixed(1)}`)
    .join(' · ')
  return { title: when, subtitle: `Floor ${floor.floorIndex + 1} · ${meals}` }
}
