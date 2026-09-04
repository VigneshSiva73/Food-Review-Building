import { MEAL_TYPES, type DailyReview, type DataIssue, type DatasetStats, type MealStats, type MealType } from '@/types'

function emptyMealStats(): MealStats {
  return { count: 0, average: 0, min: Infinity, max: -Infinity }
}

/** Derive summary statistics from cleaned daily data + the issue log. */
export function computeStats(days: DailyReview[], issues: DataIssue[]): DatasetStats {
  const perMeal = Object.fromEntries(
    MEAL_TYPES.map((m) => [m, emptyMealStats()]),
  ) as Record<MealType, MealStats>

  let totalRecords = 0
  let bestDay: DatasetStats['bestDay'] = null
  let worstDay: DatasetStats['worstDay'] = null

  const sums = Object.fromEntries(MEAL_TYPES.map((m) => [m, 0])) as Record<MealType, number>

  for (const day of days) {
    let daySum = 0
    let dayCount = 0
    for (const meal of MEAL_TYPES) {
      const review = day.meals[meal]
      if (!review) continue
      totalRecords++
      const s = perMeal[meal]
      s.count++
      sums[meal] += review.rating
      s.min = Math.min(s.min, review.rating)
      s.max = Math.max(s.max, review.rating)
      daySum += review.rating
      dayCount++
    }
    if (dayCount === 0) continue
    const dayAvg = daySum / dayCount
    if (!bestDay || dayAvg > bestDay.average) bestDay = { date: day.date, average: dayAvg }
    if (!worstDay || dayAvg < worstDay.average) worstDay = { date: day.date, average: dayAvg }
  }

  for (const meal of MEAL_TYPES) {
    const s = perMeal[meal]
    s.average = s.count > 0 ? sums[meal] / s.count : 0
    if (s.count === 0) {
      s.min = 0
      s.max = 0
    }
  }

  const count = (type: DataIssue['type']) => issues.filter((i) => i.type === type).length

  return {
    totalDays: days.length,
    totalRecords,
    duplicatesRemoved: count('duplicate'),
    conflictsResolved: count('conflict'),
    invalidRowsDropped: count('invalid-row'),
    perMeal,
    bestDay,
    worstDay,
    dateRange:
      days.length > 0 ? { start: days[0].date, end: days[days.length - 1].date } : null,
  }
}
