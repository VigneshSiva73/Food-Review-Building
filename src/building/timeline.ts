import { animationConfig, type AnimationConfig } from '@/config'

/**
 * Construction-intro timeline (plan §29). Pure math: given a floor count it
 * yields the stagger and per-floor phase progress at any elapsed time.
 *
 * Each floor runs three overlapping phases:
 *   pillar → pillars grow from the deck to their rating height
 *   slab   → the tilted plate, its fascia, and the capitals land
 *   detail → glass, mullions, and the leave band above settle in
 *
 * The stagger shrinks automatically so the whole sequence always fits inside
 * `maxTotalMs`, however large the dataset.
 */

export interface ConstructionTimeline {
  floorCount: number
  staggerMs: number
  /** Duration of one floor's full pillar→slab→detail sequence. */
  perFloorMs: number
  totalMs: number
}

export interface FloorProgress {
  pillar: number
  slab: number
  detail: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Ease-out cubic — fast start, gentle settle, the standard "growth" feel. */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function buildTimeline(
  floorCount: number,
  c: AnimationConfig = animationConfig,
): ConstructionTimeline {
  const perFloorMs = c.pillarGrowMs + c.slabAppearMs + c.mullionAppearMs
  if (floorCount <= 0) {
    return { floorCount: 0, staggerMs: 0, perFloorMs, totalMs: 0 }
  }
  if (floorCount === 1) {
    return { floorCount, staggerMs: 0, perFloorMs, totalMs: perFloorMs }
  }

  const gaps = floorCount - 1
  const naturalTotal = gaps * c.floorStaggerMs + perFloorMs
  const staggerMs =
    naturalTotal <= c.maxTotalMs
      ? c.floorStaggerMs
      : Math.max(0, (c.maxTotalMs - perFloorMs) / gaps)

  return { floorCount, staggerMs, perFloorMs, totalMs: gaps * staggerMs + perFloorMs }
}

export function floorProgress(
  timeline: ConstructionTimeline,
  floorIndex: number,
  elapsedMs: number,
  c: AnimationConfig = animationConfig,
): FloorProgress {
  const local = elapsedMs - floorIndex * timeline.staggerMs
  return {
    pillar: clamp01(local / c.pillarGrowMs),
    slab: clamp01((local - c.pillarGrowMs) / c.slabAppearMs),
    detail: clamp01((local - c.pillarGrowMs - c.slabAppearMs) / c.mullionAppearMs),
  }
}

/**
 * Number of leading floors whose given phase has begun. Because later floors
 * always start later, the revealed set is always a prefix — which is what
 * lets the renderer reveal geometry with instance counts and draw ranges
 * instead of rewriting buffers.
 */
export function revealedFloorCount(
  timeline: ConstructionTimeline,
  phase: keyof FloorProgress,
  elapsedMs: number,
  c: AnimationConfig = animationConfig,
): number {
  let count = 0
  for (let i = 0; i < timeline.floorCount; i++) {
    if (floorProgress(timeline, i, elapsedMs, c)[phase] <= 0) break
    count++
  }
  return count
}
