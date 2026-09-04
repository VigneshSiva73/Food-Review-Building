/**
 * Longest frame step any animation may trust.
 *
 * Under frameloop="demand" the render clock only ticks on rendered frames, so
 * the first frame after an idle period reports the whole idle span as its
 * delta — seconds, not milliseconds. R3F passes that through unclamped
 * (it calls clock.getDelta() and hands the raw value to every useFrame), so
 * anything integrating delta must clamp it or a single frame will consume an
 * entire animation.
 */
export const MAX_FRAME_DELTA_S = 0.1

/** True when the viewer asked the OS to reduce animation. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
