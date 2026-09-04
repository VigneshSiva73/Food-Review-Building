import { isLeaveDayISO } from '@/utils/date'
import type { DailyReview, FloorLayout } from '@/types'

/**
 * Pure month/day slicing logic for the Bambu-style filter (year → month →
 * day-limit). Floors within one month are chronological (solver guarantee),
 * so every "visible" set here is a prefix — which is what lets the day slider
 * reuse the construction reveal machinery unchanged.
 */

export interface MonthKey {
  year: number
  /** Calendar month, 1–12. */
  month: number
}

const isoPrefix = (key: MonthKey) => `${key.year}-${String(key.month).padStart(2, '0')}`

/** Distinct years present in the dataset, ascending. */
export function availableYears(days: DailyReview[]): number[] {
  return [...new Set(days.map((d) => Number(d.date.slice(0, 4))))].sort((a, b) => a - b)
}

export function monthHasData(days: DailyReview[], key: MonthKey): boolean {
  const prefix = isoPrefix(key)
  return days.some((d) => d.date.startsWith(prefix))
}

/** All review days inside one calendar month, in chronological order. */
export function daysForMonth(days: DailyReview[], key: MonthKey): DailyReview[] {
  const prefix = isoPrefix(key)
  return days.filter((d) => d.date.startsWith(prefix))
}

/** Number of calendar days in the month (leap-year aware). */
export function daysInCalendarMonth(key: MonthKey): number {
  return new Date(Date.UTC(key.year, key.month, 0)).getUTCDate()
}

/**
 * The last day of the month a review could have been recorded on.
 *
 * Leave days carry no records — the pipeline strips them — so a month ending
 * on a Sunday is finished on the Saturday before it, and asking for data on
 * the 31st would call every such month unfinished.
 */
export function lastWorkingDayOfMonth(key: MonthKey): number {
  let day = daysInCalendarMonth(key)
  while (day > 1 && isLeaveDayISO(`${isoPrefix(key)}-${String(day).padStart(2, '0')}`)) day--
  return day
}

/**
 * Whether this month's reviews run all the way to its end.
 *
 * Read as "is this month finished", which is a property of the DATA, not of
 * the calendar: the dataset simply stops partway through its newest month
 * because those meals have not been eaten yet. Mid-month gaps are tolerated —
 * a missing Tuesday is a missing record, not an unfinished month — so only the
 * last day covered is compared against the last day there could have been.
 */
export function monthIsComplete(days: DailyReview[], key: MonthKey): boolean {
  const month = daysForMonth(days, key)
  if (month.length === 0) return false
  const last = Number(month[month.length - 1].date.slice(8, 10))
  return last >= lastWorkingDayOfMonth(key)
}

/**
 * How many leading floors stay visible for a day-of-month limit.
 * `null` (or a limit past the month's end) shows everything.
 */
export function visibleFloorCount(floors: FloorLayout[], dayLimit: number | null): number {
  if (dayLimit === null) return floors.length
  let count = 0
  for (const floor of floors) {
    if (Number(floor.date.slice(8, 10)) > dayLimit) break
    count++
  }
  return count
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3))
