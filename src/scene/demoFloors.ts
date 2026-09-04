import { solveFloor } from '@/building'
import type { DailyReview, FloorLayout, MealType } from '@/types'
import { weekdayOfISO } from '@/utils/date'

/**
 * Phase 6 visual-inspection fixtures (?demo=equal|spread|saturday).
 * Dev-only: lets the joint geometry be checked under controlled ratings
 * without editing the dataset. Removed from the UI path in Phase 7+ but kept
 * for debugging.
 */

function fixtureDay(date: string, ratings: Partial<Record<MealType, number>>): DailyReview {
  const weekday = weekdayOfISO(date)
  const day: DailyReview = { date, weekday, isSaturday: weekday === 6, meals: {} }
  for (const [meal, rating] of Object.entries(ratings)) {
    day.meals[meal as MealType] = {
      date,
      mealType: meal as MealType,
      rating,
      vendor: meal === 'Lunch' ? 'Smith' : 'John',
    }
  }
  return day
}

export function demoFloor(kind: string): FloorLayout | null {
  switch (kind) {
    case 'equal':
      return solveFloor(fixtureDay('2026-06-04', { Breakfast: 3, Lunch: 3, Dinner: 3 }), 0, 0)
    case 'spread':
      return solveFloor(fixtureDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }), 0, 0)
    case 'saturday':
      return solveFloor(fixtureDay('2026-06-06', { Breakfast: 2, Lunch: 4 }), 0, 0)
    default:
      return null
  }
}
