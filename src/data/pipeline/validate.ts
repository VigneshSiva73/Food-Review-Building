import { dataConfig } from '@/config'
import {
  MEAL_TYPES,
  type Attendance,
  type DataIssue,
  type FoodReview,
  type MealType,
} from '@/types'
import { parseDDMMYYYY } from '@/utils/date'
import type { RawRow } from './parse'

export interface ValidateResult {
  reviews: FoodReview[]
  issues: DataIssue[]
}

const mealLookup = new Map<string, MealType>(MEAL_TYPES.map((m) => [m.toLowerCase(), m]))

/**
 * Turn raw rows into typed reviews. Invalid rows are dropped with an issue;
 * out-of-range ratings are clamped with an issue. Nothing fails silently.
 */
/**
 * Read one row's attendance, or nothing at all.
 *
 * Three states, and they are not the same: absent columns mean the file does
 * not record attendance and there is nothing to report; a present but
 * unreadable value is a fault and is reported; a value that breaks the funnel
 * — more eaten than served, more reviewed than eaten — is repaired down to the
 * stage above it, because the smaller number is the one that can be trusted.
 *
 * A partly-filled row is dropped rather than half-believed. Two of the three
 * counts describe nothing on their own.
 */
function readAttendance(raw: RawRow, issues: DataIssue[]): Attendance | null {
  if (raw.count === '' && raw.consumed === '' && raw.reviewed === '') return null

  const read = (label: string, text: string): number | null => {
    const value = Number(text)
    if (text === '' || !Number.isFinite(value) || value < 0) {
      issues.push({
        type: 'invalid-row',
        row: raw.row,
        message: `${label} "${text}" is not a count; attendance ignored for this row`,
      })
      return null
    }
    return Math.round(value)
  }

  const count = read('People count', raw.count)
  const consumed = read('Consumed', raw.consumed)
  const reviewed = read('Reviewed', raw.reviewed)
  if (count === null || consumed === null || reviewed === null) return null

  const { min, max } = dataConfig.attendance
  let served = count
  if (served < min || served > max) {
    const clamped = Math.min(max, Math.max(min, served))
    issues.push({
      type: 'out-of-range',
      row: raw.row,
      message: `People count ${served} outside [${min}, ${max}]; clamped to ${clamped}`,
    })
    served = clamped
  }

  let ate = consumed
  if (ate > served) {
    issues.push({
      type: 'out-of-range',
      row: raw.row,
      message: `Consumed ${ate} exceeds the ${served} served; clamped to ${served}`,
    })
    ate = served
  }

  let rated = reviewed
  if (rated > ate) {
    issues.push({
      type: 'out-of-range',
      row: raw.row,
      message: `Reviewed ${rated} exceeds the ${ate} consumed; clamped to ${ate}`,
    })
    rated = ate
  }

  return { count: served, consumed: ate, reviewed: rated }
}

export function validateRows(rows: RawRow[]): ValidateResult {
  const reviews: FoodReview[] = []
  const issues: DataIssue[] = []

  for (const raw of rows) {
    const iso = parseDDMMYYYY(raw.date)
    if (!iso) {
      issues.push({
        type: 'invalid-row',
        row: raw.row,
        message: `Invalid date "${raw.date}" (expected ${dataConfig.dateFormat})`,
      })
      continue
    }

    const mealType = mealLookup.get(raw.mealType.toLowerCase())
    if (!mealType) {
      issues.push({
        type: 'invalid-row',
        row: raw.row,
        message: `Unknown meal type "${raw.mealType}"`,
      })
      continue
    }

    let rating = Number(raw.rating)
    if (raw.rating === '' || !Number.isFinite(rating)) {
      issues.push({
        type: 'invalid-row',
        row: raw.row,
        message: `Rating "${raw.rating}" is not a number`,
      })
      continue
    }
    if (rating < dataConfig.ratingMin || rating > dataConfig.ratingMax) {
      const clamped = Math.min(dataConfig.ratingMax, Math.max(dataConfig.ratingMin, rating))
      issues.push({
        type: 'out-of-range',
        row: raw.row,
        message: `Rating ${rating} outside [${dataConfig.ratingMin}, ${dataConfig.ratingMax}]; clamped to ${clamped}`,
      })
      rating = clamped
    }

    if (raw.vendor === '') {
      issues.push({ type: 'invalid-row', row: raw.row, message: 'Empty vendor name' })
      continue
    }

    const attendance = readAttendance(raw, issues)
    reviews.push({ date: iso, mealType, rating, vendor: raw.vendor, ...(attendance && { attendance }) })
  }

  return { reviews, issues }
}
