import type { DataIssue, FoodReview } from '@/types'
import { isLeaveDayISO, isoToDisplay, weekdayOfISO } from '@/utils/date'

export interface CalendarResult {
  reviews: FoodReview[]
  issues: DataIssue[]
}

/**
 * Enforce the office calendar: no records on leave days (Sundays, third
 * Saturdays) and no Dinner on Saturdays. Anomalous records are excluded from
 * geometry but reported — the building never renders data that shouldn't exist.
 */
export function applyCalendarRules(reviews: FoodReview[]): CalendarResult {
  const out: FoodReview[] = []
  const issues: DataIssue[] = []

  for (const r of reviews) {
    const display = `${isoToDisplay(r.date)} ${r.mealType}`
    if (isLeaveDayISO(r.date)) {
      issues.push({
        type: 'unexpected-meal',
        message: `Record on leave day excluded: ${display}`,
      })
      continue
    }
    if (weekdayOfISO(r.date) === 6 && r.mealType === 'Dinner') {
      issues.push({
        type: 'unexpected-meal',
        message: `Dinner on a Saturday excluded: ${display}`,
      })
      continue
    }
    out.push(r)
  }

  return { reviews: out, issues }
}
