import { timeOfDayConfig } from '@/config'
import { smootherstep } from '@/scene/cameraMotion'
import { MAX_FRAME_DELTA_S } from '@/utils/motion'
import { normalizeHour } from './presetAt'

/**
 * The clock behind a change of hour.
 *
 * One transition object exists at a time, and re-targeting mutates it rather
 * than starting a second. That is the whole defence against duelling tweens: a
 * click part-way through an earlier change starts from whatever hour is
 * *currently on screen*, so the world always eases from where it visibly is
 * rather than from where some earlier animation began.
 *
 * Because everything the scene shows is a function of one number, that
 * snapshot is a number. An earlier version of this idea tweened whole lighting
 * presets and had to deep-copy the live blend on every retarget to avoid
 * aliasing the buffer the driver was writing into; a scalar cannot alias.
 */
export interface HourTransition {
  /** Where the sweep began. */
  fromHour: number
  /**
   * Where it is heading, deliberately NOT wrapped onto [0, 24).
   *
   * Time only runs forwards. Night (21.5) to Day (10) is authored as 21.5 →
   * 34, so the sweep passes through midnight and dawn instead of reversing
   * back through dusk. Callers read the live hour through `normalizeHour`.
   */
  toHour: number
  elapsedS: number
  durationS: number
  done: boolean
}

/** Hours travelled going forwards from `from` to `to`. Always in [0, 24). */
export function forwardDistance(from: number, to: number): number {
  return normalizeHour(to - from)
}

/**
 * How long a sweep of this size should take.
 *
 * Distance-scaled: a two-hour nudge should not take as long as the twelve-hour
 * haul from night back to morning, and a fixed duration makes one of the two
 * feel wrong however it is tuned.
 */
export function durationFor(distanceHours: number): number {
  const { baseS, perHourS, maxS } = timeOfDayConfig.transition
  return Math.min(maxS, baseS + perHourS * distanceHours)
}

export function createHourTransition(startHour: number): HourTransition {
  const h = normalizeHour(startHour)
  return { fromHour: h, toHour: h, elapsedS: 0, durationS: 0, done: true }
}

/**
 * Aim an existing transition at a new hour, starting from `currentHour`.
 *
 * A zero duration lands immediately, which is how reduced-motion and the
 * opening state are honoured without a second code path.
 */
export function retargetHour(
  transition: HourTransition,
  currentHour: number,
  targetHour: number,
  durationS: number,
): HourTransition {
  const from = normalizeHour(currentHour)
  transition.fromHour = from
  transition.toHour = from + forwardDistance(from, targetHour)
  transition.elapsedS = 0
  transition.durationS = Math.max(0, durationS)
  transition.done = transition.durationS === 0
  return transition
}

/**
 * Advance by one frame and return the hour now on screen.
 *
 * The delta is clamped: under `frameloop="demand"` the first frame after an
 * idle spell reports the entire idle span, which would otherwise swallow the
 * whole sweep in one step.
 *
 * Eased with the same smootherstep the camera flights use — its first and
 * second derivatives vanish at both ends, so the light neither jerks into
 * motion nor stops dead.
 */
export function tickHour(transition: HourTransition, deltaS: number): number {
  if (transition.done || transition.durationS === 0) {
    transition.done = true
    return normalizeHour(transition.toHour)
  }

  transition.elapsedS += Math.min(Math.max(deltaS, 0), MAX_FRAME_DELTA_S)
  const raw = Math.min(1, transition.elapsedS / transition.durationS)

  if (raw >= 1) {
    transition.done = true
    return normalizeHour(transition.toHour)
  }

  const t = smootherstep(raw)
  return normalizeHour(transition.fromHour * (1 - t) + transition.toHour * t)
}
