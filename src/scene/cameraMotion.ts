import { cameraConfig } from '@/config'
import { MAX_FRAME_DELTA_S } from '@/utils/motion'

/**
 * Pure maths for the cinematic camera travel. Kept out of the component so the
 * timing and pathing can be unit-tested without a renderer.
 */

/** Shortest signed way round from angle `a` to `b`, in (−π, π]. */
export function shortestAngleDelta(a: number, b: number): number {
  const TAU = Math.PI * 2
  return (((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI
}

/**
 * Quintic smootherstep. Its first and second derivatives vanish at both ends,
 * so the camera eases away and settles without the visible "kick" of a
 * quadratic — which is most of what makes a move read as filmed.
 */
export function smootherstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * x * (x * (6 * x - 15) + 10)
}

/** Time a move should take, given how far the camera actually travels. */
export function travelDuration(
  distance: number,
  c: typeof cameraConfig.focus = cameraConfig.focus,
): number {
  const raw = c.minDurationMs + Math.max(0, distance) * c.msPerUnit
  return Math.min(c.maxDurationMs, Math.max(c.minDurationMs, raw))
}

/**
 * Advance a flight's progress by one frame.
 *
 * Clamping the step is what keeps the move a move: an unclamped idle-time
 * delta jumps progress straight to 1 and the camera teleports.
 */
export function advanceFlight(t: number, deltaSeconds: number, durationMs: number): number {
  const step = Math.min(Math.max(0, deltaSeconds), MAX_FRAME_DELTA_S) * 1000
  return Math.min(1, t + step / durationMs)
}

/**
 * Fraction of a module height to raise the look-at point by, partway through
 * the flight — a gentle crane. Zero at both ends, so endpoints stay exact.
 */
export function targetLift(t: number, lift: number = cameraConfig.focus.targetLift): number {
  return lift * Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
}

/**
 * Extra orbit radius partway through the flight: nothing at either end, a
 * gentle pull-back in the middle. Keeps the camera clear of the building it is
 * swinging around, and gives the move its establishing-shot arc.
 */
export function arcBulge(t: number, bulge: number = cameraConfig.focus.arcBulge): number {
  return 1 + bulge * Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
}
