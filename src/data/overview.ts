import { MONTH_NAMES } from '@/building/monthFilter'
import { MEAL_TYPES, type Attendance, type DailyReview, type MealType } from '@/types'

/**
 * The whole dataset, read as buildings rather than as rows.
 *
 * The pipeline's own `DatasetStats` answers questions about the DATA — how
 * many records, how many duplicates, what the best day was. This answers the
 * questions the model poses instead: which month is the best building, which
 * pillar is the tallest one standing, and where in the city it is. Both are
 * summaries of the same days; they are separate because they are asked by
 * different readers, and folding them together would put "conflicts resolved"
 * next to "tallest pillar".
 *
 * Pure and Three-free, so the wording and the arithmetic are unit-tested
 * without a renderer — the same rule the layout solver follows.
 */

export interface MonthAverage {
  /** ISO `yyyy-mm`, which sorts and slices without parsing. */
  key: string
  /** Display form, e.g. "August 2025". */
  label: string
  average: number
  /** Days with at least one rating — the building's floor count. */
  days: number
  /** Rated meals — the building's pillar count. */
  meals: number
}

export interface ExtremeFloor {
  /** Mean of that day's rated meals. */
  average: number
  date: string
  /** The building that floor is in, e.g. "August 2025". */
  month: string
  /** Which floor of it, counting from one. */
  floor: number
}

export interface ExtremePillar {
  meal: MealType
  rating: number
  date: string
  /** The building that pillar stands in, e.g. "August 2025". */
  month: string
  /** Which floor of it, counting from one. */
  floor: number
}

/**
 * Mean attendance over some set of sittings, or null where none was recorded.
 *
 * Null rather than zeroes, and the distinction matters everywhere it appears:
 * a file that does not record attendance has to say so, because "no data" and
 * "nobody came" are opposite readings of the same blank.
 */
export type MeanAttendance = Attendance | null

export interface DatasetOverview {
  /** Mean rating per meal across every day in the dataset. */
  averages: { meal: MealType; average: number; count: number; attendance: MeanAttendance }[]
  /** Mean attendance across every sitting on one day, and in one month. */
  perDay: MeanAttendance
  perMonth: MeanAttendance
  /** Everyone the dataset counts, added up. */
  totals: MeanAttendance
  /** Mean across all meals of all days. */
  overall: number | null
  months: number
  days: number
  meals: number
  bestMonth: MonthAverage | null
  worstMonth: MonthAverage | null
  bestFloor: ExtremeFloor | null
  worstFloor: ExtremeFloor | null
  tallest: ExtremePillar | null
  shortest: ExtremePillar | null
  range: { start: string; end: string } | null
}

export interface FloorMeal {
  meal: MealType
  /** null when the day recorded no rating for that meal — a support post. */
  rating: number | null
  attendance: Attendance | null
}

export interface FloorStatistics {
  date: string
  year: number
  /** Month name alone, e.g. "August" — the year is reported beside it. */
  month: string
  /** Meals in the solver's corner order, so the card reads left to right. */
  meals: FloorMeal[]
  average: number | null
  /** Everyone the day counted, summed across its sittings. */
  totals: MeanAttendance
  /** The same three, tallest first — which is the order the tower shows. */
  ranked: FloorMeal[]
}

/**
 * One day, as its own floor.
 *
 * Ranked as well as listed, and both orders earn their place: the meals in
 * corner order are how the day is READ, pillar by pillar round the plan, and
 * the same three by height are what the floor LOOKS like from outside. A card
 * that gave only the first makes the reader sort three numbers to see what
 * they are already looking at.
 *
 * A meal with no record is a support post, not a zero. It keeps its place in
 * the corner order and sorts last by height, because a corner that carries no
 * rating still carries the plate.
 */
export function floorStatistics(day: DailyReview): FloorStatistics {
  const meals: FloorMeal[] = MEAL_TYPES.map((meal) => {
    const review = day.meals[meal]
    return {
      meal,
      rating: review ? review.rating : null,
      attendance: review?.attendance ?? null,
    }
  })

  const rated = meals.filter((m) => m.rating !== null)
  const seated = meals.filter((m) => m.attendance !== null)
  const totals = seated.length
    ? seated.reduce(
        (t, m) => ({
          count: t.count + m.attendance!.count,
          consumed: t.consumed + m.attendance!.consumed,
          reviewed: t.reviewed + m.attendance!.reviewed,
        }),
        { count: 0, consumed: 0, reviewed: 0 },
      )
    : null

  return {
    date: day.date,
    year: Number(day.date.slice(0, 4)),
    month: MONTH_NAMES[Number(day.date.slice(5, 7)) - 1],
    meals,
    average:
      rated.length > 0 ? rated.reduce((t, m) => t + m.rating!, 0) / rated.length : null,
    totals,
    // Descending, with the unrated corners after every rated one.
    ranked: [...meals].sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity)),
  }
}

export interface PillarStatistics {
  date: string
  year: number
  /** Month name alone, e.g. "August" — the year is reported beside it. */
  month: string
  /** 0 = Sunday … 6 = Saturday, which is what lets an absence be explained. */
  weekday: number
  meal: MealType
  /** null where the day recorded no such sitting — a support post, not a nought. */
  rating: number | null
  /** null likewise: nobody served it, rather than somebody nameless. */
  vendor: string | null
  attendance: Attendance | null
}

/**
 * One meal, as its own pillar.
 *
 * The narrowest reading in the family, and the only one that is a RECORD
 * rather than a summary — a pillar is one row of the file, so its card reports
 * that row and averages nothing. The rating and the vendor come back exactly
 * as they were written.
 *
 * A sitting that never happened is reported as absent in every field instead
 * of as zeroes, and the weekday comes with it: a missing Saturday dinner is a
 * kitchen that was closed, and a missing Tuesday lunch is a gap in the data.
 * They look identical in the file and the card must not read them alike.
 */
export function pillarStatistics(day: DailyReview, meal: MealType): PillarStatistics {
  const review = day.meals[meal]
  return {
    date: day.date,
    year: Number(day.date.slice(0, 4)),
    month: MONTH_NAMES[Number(day.date.slice(5, 7)) - 1],
    weekday: day.weekday,
    meal,
    rating: review ? review.rating : null,
    vendor: review?.vendor ? review.vendor : null,
    attendance: review?.attendance ?? null,
  }
}

export interface MealExtreme {
  /** Which floor of this building it stands on, counting from one. */
  floor: number
  date: string
  rating: number
}

export interface VendorTally {
  vendor: string
  /** Sittings this vendor served, of this meal, in this month. */
  count: number
  average: number
}

export interface MealStatistics {
  /** Rated sittings — the column's pillar count, not the month's floor count. */
  pillars: number
  average: number | null
  tallest: MealExtreme | null
  shortest: MealExtreme | null
  /** Busiest first, then alphabetical, so the order is stable across reloads. */
  vendors: VendorTally[]
  /** Mean over the sittings that recorded attendance, and the sum of them. */
  attendance: MeanAttendance
  totals: MeanAttendance
}

/**
 * One meal, read down a whole building.
 *
 * The column rather than the floor: every Lunch in the month, which is what
 * the crown's ribs stand for and what the tower lights when one is pointed at.
 * It sits between the pillar card and the building card — narrower than a
 * month, wider than a sitting — and it is the only reading in the family where
 * the VENDORS are worth listing, because one sitting has a single vendor and a
 * whole month has every vendor there is.
 *
 * `days` is the month, in order, exactly as the building was built from it, so
 * a floor number here is the same floor number the reader counts up the tower.
 * Days that recorded no such meal are skipped rather than counted as nought:
 * a Saturday serves no dinner, and dividing by it would rank the column below
 * every other for a meal it never offered.
 */
export function mealStatistics(days: DailyReview[], meal: MealType): MealStatistics {
  let sum = 0
  let pillars = 0
  let tallest: MealExtreme | null = null
  let shortest: MealExtreme | null = null
  const byVendor = new Map<string, { sum: number; count: number }>()
  const total: Attendance = { count: 0, consumed: 0, reviewed: 0 }
  let seated = 0

  days.forEach((day, index) => {
    const review = day.meals[meal]
    if (!review) return
    sum += review.rating
    pillars++

    const at: MealExtreme = { floor: index + 1, date: day.date, rating: review.rating }
    if (!tallest || at.rating > tallest.rating) tallest = at
    if (!shortest || at.rating < shortest.rating) shortest = at

    if (review.vendor) {
      const tally = byVendor.get(review.vendor) ?? { sum: 0, count: 0 }
      if (!byVendor.has(review.vendor)) byVendor.set(review.vendor, tally)
      tally.sum += review.rating
      tally.count++
    }

    if (review.attendance) {
      total.count += review.attendance.count
      total.consumed += review.attendance.consumed
      total.reviewed += review.attendance.reviewed
      seated++
    }
  })

  const vendors = [...byVendor.entries()]
    .map(([vendor, t]) => ({ vendor, count: t.count, average: t.sum / t.count }))
    .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor))

  return {
    pillars,
    average: pillars > 0 ? sum / pillars : null,
    tallest,
    shortest,
    vendors,
    attendance:
      seated > 0
        ? {
            count: total.count / seated,
            consumed: total.consumed / seated,
            reviewed: total.reviewed / seated,
          }
        : null,
    totals: seated > 0 ? total : null,
  }
}

function monthKey(date: string): string {
  return date.slice(0, 7)
}

function monthLabel(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

/**
 * Summarise every day in the dataset.
 *
 * One pass, and the days are assumed chronological — which the pipeline
 * guarantees and the floor numbering depends on. That ordering is what lets a
 * pillar report the floor it stands on: a floor index is a position in its own
 * month's run, not a property of the date, so it is counted as the month is
 * walked rather than derived afterwards.
 *
 * Ties go to the earlier month, and to the earlier day within a month. Any
 * rule would do; having one written down is what stops the answer changing
 * when the data is reloaded.
 */
export function datasetOverview(days: DailyReview[]): DatasetOverview {
  const sums = new Map<MealType, { sum: number; count: number }>()
  for (const meal of MEAL_TYPES) sums.set(meal, { sum: 0, count: 0 })

  // Attendance is optional, so it is tallied with its OWN denominators. Using
  // the meal counts would divide by sittings that recorded no attendance at
  // all and quietly understate every average.
  const seats = new Map<MealType, { total: Attendance; n: number }>()
  for (const meal of MEAL_TYPES) {
    seats.set(meal, { total: { count: 0, consumed: 0, reviewed: 0 }, n: 0 })
  }
  const daysWithSeats = new Set<string>()
  const monthsWithSeats = new Set<string>()

  const byMonth = new Map<string, { sum: number; meals: number; days: number }>()
  let tallest: ExtremePillar | null = null
  let shortest: ExtremePillar | null = null
  let bestFloor: ExtremeFloor | null = null
  let worstFloor: ExtremeFloor | null = null

  for (const day of days) {
    const key = monthKey(day.date)
    const month = byMonth.get(key) ?? { sum: 0, meals: 0, days: 0 }
    if (!byMonth.has(key)) byMonth.set(key, month)
    // Counted before the meals, so it is the floor this day IS rather than the
    // number of floors below it.
    month.days++
    const floor = month.days

    let daySum = 0
    let dayCount = 0

    for (const meal of MEAL_TYPES) {
      const review = day.meals[meal]
      if (!review) continue
      const bucket = sums.get(meal)!
      bucket.sum += review.rating
      bucket.count++
      if (review.attendance) {
        const seat = seats.get(meal)!
        seat.total.count += review.attendance.count
        seat.total.consumed += review.attendance.consumed
        seat.total.reviewed += review.attendance.reviewed
        seat.n++
        daysWithSeats.add(day.date)
        monthsWithSeats.add(key)
      }
      month.sum += review.rating
      month.meals++
      daySum += review.rating
      dayCount++

      const pillar: ExtremePillar = {
        meal,
        rating: review.rating,
        date: day.date,
        month: monthLabel(key),
        floor,
      }
      if (!tallest || review.rating > tallest.rating) tallest = pillar
      if (!shortest || review.rating < shortest.rating) shortest = pillar
    }

    // A floor is judged on its own meals, however many it recorded. Dividing a
    // Saturday's two ratings by three would rank every Saturday last for the
    // dinner it was never going to serve.
    if (dayCount === 0) continue
    const storey: ExtremeFloor = {
      average: daySum / dayCount,
      date: day.date,
      month: monthLabel(key),
      floor,
    }
    if (!bestFloor || storey.average > bestFloor.average) bestFloor = storey
    if (!worstFloor || storey.average < worstFloor.average) worstFloor = storey
  }

  const mean = (total: Attendance, n: number): MeanAttendance =>
    n > 0
      ? { count: total.count / n, consumed: total.consumed / n, reviewed: total.reviewed / n }
      : null

  const grand: Attendance = { count: 0, consumed: 0, reviewed: 0 }
  for (const meal of MEAL_TYPES) {
    const { total } = seats.get(meal)!
    grand.count += total.count
    grand.consumed += total.consumed
    grand.reviewed += total.reviewed
  }

  const averages = MEAL_TYPES.map((meal) => {
    const { sum, count } = sums.get(meal)!
    const seat = seats.get(meal)!
    return {
      meal,
      average: count > 0 ? sum / count : 0,
      count,
      attendance: mean(seat.total, seat.n),
    }
  })
  const meals = averages.reduce((t, a) => t + a.count, 0)
  const overallSum = averages.reduce((t, a) => t + a.average * a.count, 0)

  // Only months that recorded something can be the best or the worst one; a
  // month with no meals has no average to compare, not an average of zero.
  const rated = [...byMonth.entries()]
    .filter(([, m]) => m.meals > 0)
    .map(([key, m]) => ({
      key,
      label: monthLabel(key),
      average: m.sum / m.meals,
      days: m.days,
      meals: m.meals,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  let bestMonth: MonthAverage | null = null
  let worstMonth: MonthAverage | null = null
  for (const month of rated) {
    if (!bestMonth || month.average > bestMonth.average) bestMonth = month
    if (!worstMonth || month.average < worstMonth.average) worstMonth = month
  }

  return {
    averages,
    // A day's figure is everyone across its sittings, not everyone at one of
    // them — three meals a day means three chances to be counted.
    perDay: mean(grand, daysWithSeats.size),
    perMonth: mean(grand, monthsWithSeats.size),
    totals: daysWithSeats.size > 0 ? grand : null,
    overall: meals > 0 ? overallSum / meals : null,
    months: byMonth.size,
    days: days.length,
    meals,
    bestMonth,
    worstMonth,
    bestFloor,
    worstFloor,
    tallest,
    shortest,
    range: days.length > 0 ? { start: days[0].date, end: days[days.length - 1].date } : null,
  }
}
