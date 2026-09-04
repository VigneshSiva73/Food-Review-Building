import type { DailyReview, FoodReview } from '@/types'
import { weekdayOfISO } from '@/utils/date'

/**
 * Group cleaned reviews into chronological daily records.
 * Only dates that actually have at least one review produce an entry —
 * floor indices are assigned later from this ordering.
 */
export function groupByDate(reviews: FoodReview[]): DailyReview[] {
  const byDate = new Map<string, DailyReview>()

  for (const r of reviews) {
    let day = byDate.get(r.date)
    if (!day) {
      const weekday = weekdayOfISO(r.date)
      day = { date: r.date, weekday, isSaturday: weekday === 6, meals: {} }
      byDate.set(r.date, day)
    }
    day.meals[r.mealType] = r
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
