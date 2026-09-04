import type { DailyReview, Dataset, MealType } from '@/types'
import { computeStats } from '@/data/pipeline'
import { isLeaveDayISO, weekdayOfISO } from '@/utils/date'

/**
 * Deterministic synthetic dataset for performance profiling (?days=N).
 * Follows the same calendar rules as the real dataset (Sundays and third
 * Saturdays off, Saturdays without Dinner) starting 2026-06-04, for any
 * number of valid days. Never used in production paths — only when the
 * query-string override is present.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VENDOR: Record<MealType, string> = { Breakfast: 'John', Lunch: 'Smith', Dinner: 'John' }

export function syntheticDays(count: number): DailyReview[] {
  const rand = mulberry32(0x5eed + count)
  const days: DailyReview[] = []
  let t = Date.UTC(2026, 5, 4)

  while (days.length < count) {
    const iso = new Date(t).toISOString().slice(0, 10)
    t += 86_400_000
    if (isLeaveDayISO(iso)) continue

    const weekday = weekdayOfISO(iso)
    const isSaturday = weekday === 6
    const meals: MealType[] = isSaturday
      ? ['Breakfast', 'Lunch']
      : ['Breakfast', 'Lunch', 'Dinner']

    const day: DailyReview = { date: iso, weekday, isSaturday, meals: {} }
    for (const meal of meals) {
      day.meals[meal] = {
        date: iso,
        mealType: meal,
        rating: Math.round((1.2 + rand() * 3.6) * 1000) / 1000,
        vendor: VENDOR[meal],
      }
    }
    days.push(day)
  }
  return days
}

export function syntheticDataset(count: number): Dataset {
  const days = syntheticDays(count)
  return { days, issues: [], stats: computeStats(days, []) }
}
