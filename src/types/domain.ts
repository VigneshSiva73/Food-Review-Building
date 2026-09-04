/**
 * Domain models for the food-review dataset.
 * This layer is pure data — no Three.js, no React.
 */

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner'] as const
export type MealType = (typeof MEAL_TYPES)[number]

/**
 * How many people a sitting reached, at each stage.
 *
 * A funnel, and the order is the invariant: everyone who ate was served, and
 * everyone who reviewed ate. The pipeline enforces that rather than trusting
 * it, because a reviewed count above the consumed one is the kind of error a
 * spreadsheet produces silently and a chart repeats without comment.
 */
export interface Attendance {
  /** People the meal was put out for. */
  count: number
  consumed: number
  reviewed: number
}

/** A single validated review record. Dates are ISO `yyyy-mm-dd`. */
export interface FoodReview {
  date: string
  mealType: MealType
  rating: number
  vendor: string
  /** Absent when the file records no attendance — not zero people. */
  attendance?: Attendance
}

/** All reviews for one calendar day, keyed by meal slot. */
export interface DailyReview {
  date: string
  /** 0 = Sunday … 6 = Saturday (matches Date.getDay()). */
  weekday: number
  isSaturday: boolean
  meals: Partial<Record<MealType, FoodReview>>
}

export type DataIssueType =
  | 'invalid-row'
  | 'duplicate'
  | 'conflict'
  | 'unexpected-meal'
  | 'out-of-range'

export interface DataIssue {
  type: DataIssueType
  /** 1-based CSV row number, when attributable to a specific row. */
  row?: number
  message: string
}

export interface MealStats {
  count: number
  average: number
  min: number
  max: number
}

export interface DatasetStats {
  totalDays: number
  totalRecords: number
  duplicatesRemoved: number
  conflictsResolved: number
  invalidRowsDropped: number
  perMeal: Record<MealType, MealStats>
  bestDay: { date: string; average: number } | null
  worstDay: { date: string; average: number } | null
  dateRange: { start: string; end: string } | null
}

/** Output of the full data pipeline: cleaned days + quality report. */
export interface Dataset {
  days: DailyReview[]
  issues: DataIssue[]
  stats: DatasetStats
}
