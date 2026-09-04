/**
 * Deterministic generator for the office food-review dataset.
 *
 * Rules (from the project brief):
 *   - Date range: 01/01/2025 → 26/08/2026 (DD/MM/YYYY), inclusive.
 *   - Sunday = leave (no records).
 *   - Third Saturday of every month = leave (no records).
 *   - Normal Saturday = Breakfast + Lunch only.
 *   - Monday–Friday = Breakfast + Lunch + Dinner.
 *   - Vendors: Breakfast/Dinner = John, Lunch = Smith.
 *   - Ratings: decimals with 3 dp in [1, 5], with a slow annual season on
 *     top of the weekly drift so one month reads differently from the next
 *     (the month slicer exists to compare months — identical months would
 *     make it pointless).
 *   - Intentional data-quality rows: exact duplicates and conflicting
 *     duplicates at fixed RATES, so a longer range stays proportionally as
 *     dirty rather than carrying the same absolute handful of bad rows.
 *
 * Fully seeded — rerunning always produces the identical CSV.
 *
 * Usage: npm run generate:data
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// --- deterministic PRNG (mulberry32) ---------------------------------------

const SEED = 20260604

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(SEED)

// --- calendar --------------------------------------------------------------

const START = Date.UTC(2025, 0, 1) // 1 January 2025
// Fixed, not `new Date()`: the CSV is committed and the tests assert exact
// counts, so the generator has to be reproducible on any future run.
const END = Date.UTC(2026, 7, 26) // 26 August 2026
const DAY_MS = 86_400_000

function isThirdSaturday(d: Date): boolean {
  return d.getUTCDay() === 6 && Math.ceil(d.getUTCDate() / 7) === 3
}

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

// --- rating model ----------------------------------------------------------

type Meal = 'Breakfast' | 'Lunch' | 'Dinner'

const MEAL_BASE: Record<Meal, number> = {
  Breakfast: 3.6,
  Lunch: 3.1,
  Dinner: 3.35,
}
const VENDOR: Record<Meal, string> = {
  Breakfast: 'John',
  Lunch: 'Smith',
  Dinner: 'John',
}

/** Base + annual season + slow weekly drift + daily noise, clamped to [1, 5]. */
function rating(meal: Meal, dayIndex: number): number {
  const season = Math.sin((dayIndex / 365.25) * 2 * Math.PI + MEAL_BASE[meal]) * 0.4
  const drift = Math.sin((dayIndex / 14) * Math.PI + MEAL_BASE[meal]) * 0.45
  const noise = (rand() - 0.5) * 1.6
  const value = MEAL_BASE[meal] + season + drift + noise
  return Math.round(Math.min(4.95, Math.max(1.05, value)) * 1000) / 1000
}

// --- generation ------------------------------------------------------------

interface Row {
  date: string
  meal: Meal
  rating: number
  vendor: string
}

const rows: Row[] = []
let validDays = 0
let saturdays = 0

for (let t = START, i = 0; t <= END; t += DAY_MS, i++) {
  const d = new Date(t)
  const day = d.getUTCDay()
  if (day === 0 || isThirdSaturday(d)) continue // leave day

  validDays++
  const meals: Meal[] = day === 6 ? ['Breakfast', 'Lunch'] : ['Breakfast', 'Lunch', 'Dinner']
  if (day === 6) saturdays++

  for (const meal of meals) {
    rows.push({ date: formatDDMMYYYY(d), meal, rating: rating(meal, i), vendor: VENDOR[meal] })
  }
}

const uniqueCount = rows.length

// --- inject data-quality rows ----------------------------------------------
// Each duplicate is inserted directly after the row it duplicates — the
// typical shape of an accidental double-submission.

// Rates taken from the original three-month dataset (8 exact + 2 conflicting
// in 187 records), so the data-quality panel reports a believable proportion
// at any range length.
const EXACT_DUPE_RATE = 8 / 187
const CONFLICT_DUPE_RATE = 2 / 187
const EXACT_DUPES = Math.round(uniqueCount * EXACT_DUPE_RATE)
const CONFLICT_DUPES = Math.round(uniqueCount * CONFLICT_DUPE_RATE)

const pickIndices = new Set<number>()
while (pickIndices.size < EXACT_DUPES + CONFLICT_DUPES) {
  pickIndices.add(Math.floor(rand() * rows.length))
}
const picks = [...pickIndices].sort((a, b) => a - b)

let inserted = 0
picks.forEach((originalIndex, k) => {
  const at = originalIndex + inserted
  const source = rows[at]
  const isConflict = k >= EXACT_DUPES
  const dupe: Row = isConflict
    ? { ...source, rating: Math.round((source.rating + 0.5 > 4.9 ? source.rating - 0.5 : source.rating + 0.5) * 1000) / 1000 }
    : { ...source }
  rows.splice(at + 1, 0, dupe)
  inserted++
})

// --- write CSV --------------------------------------------------------------

const header = 'date,meal type,average rating,vendor name'
const csv = [header, ...rows.map((r) => `${r.date},${r.meal},${r.rating.toFixed(3)},${r.vendor}`)].join('\n') + '\n'

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'food-reviews.csv')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, csv, 'utf8')

// --- summary for validation --------------------------------------------------

console.log(`Wrote ${outPath}`)
console.log(`Valid days:            ${validDays}`)
console.log(`Two-meal Saturdays:    ${saturdays}`)
console.log(`Unique meal records:   ${uniqueCount}`)
console.log(`Exact duplicates:      ${EXACT_DUPES}`)
console.log(`Conflicting duplicates:${CONFLICT_DUPES}`)
console.log(`Total CSV data rows:   ${rows.length}`)
