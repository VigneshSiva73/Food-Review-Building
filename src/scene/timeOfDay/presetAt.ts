import { timeOfDayConfig } from '@/config'
import { emptyBlend, lerpBlended, toBlended, type BlendedPreset } from './blendPreset'

/**
 * The world at an hour.
 *
 * Every keyframe is parsed into blendable form once, at module load, so the
 * per-frame path is a binary-free scan and one lerp — no colour strings are
 * parsed while the sun is moving.
 *
 * This is the whole time-of-day model. There is no separate notion of "day" or
 * "night" below the UI: the control picks an hour, the transition tweens that
 * hour, and everything the scene shows is read from here. That is what makes
 * Day → Night pass through sunset without a line of code saying so.
 */

const PARSED: readonly BlendedPreset[] = timeOfDayConfig.keys.map((k) => toBlended(k))

/** Hours of the parsed keys, ascending. Cached to keep the scan off the hot path. */
const HOURS: readonly number[] = timeOfDayConfig.keys.map((k) => k.hour)

const DAY_HOURS = 24

/** Wrap any hour — negative, past midnight, or exactly 24 — onto [0, 24). */
export function normalizeHour(hour: number): number {
  return ((hour % DAY_HOURS) + DAY_HOURS) % DAY_HOURS
}

/**
 * Write the world at `hour` into `out`.
 *
 * Hours before the first key or after the last wrap around to the segment that
 * spans midnight, so the curve is a closed loop with no discontinuity at the
 * seam — `presetAt(23.999)` and `presetAt(0)` are the same scene.
 */
export function presetAt(hour: number, out: BlendedPreset = emptyBlend()): BlendedPreset {
  const h = normalizeHour(hour)
  const last = HOURS.length - 1

  // The segment that wraps midnight: from the final key forward to the first.
  if (h >= HOURS[last] || h < HOURS[0]) {
    const span = DAY_HOURS - HOURS[last] + HOURS[0]
    const travelled = h >= HOURS[last] ? h - HOURS[last] : DAY_HOURS - HOURS[last] + h
    return lerpBlended(PARSED[last], PARSED[0], span === 0 ? 0 : travelled / span, out)
  }

  let i = 0
  while (i < last && HOURS[i + 1] <= h) i++
  const from = HOURS[i]
  const to = HOURS[i + 1]
  return lerpBlended(PARSED[i], PARSED[i + 1], (h - from) / (to - from), out)
}
