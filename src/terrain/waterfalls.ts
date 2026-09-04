import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { River } from './rivers'

/**
 * Waterfalls, found rather than placed.
 *
 * §11 asks for waterfalls where high ground meets a steep drop, and explicitly
 * not scattered on flat land. Every river point already carries the drop to the
 * point below it, so a waterfall is simply a run of river steep enough to be
 * worth showing — the terrain decided where they are when it decided where the
 * water goes.
 *
 * Consecutive steep points are merged into one fall rather than emitted
 * separately, because a cliff is usually several grid cells deep and a stack of
 * short falls reads as a staircase.
 */

export interface Waterfall {
  /** Top of the fall. */
  x: number
  y: number
  z: number
  /** Total height of the drop. */
  height: number
  /** Width of the sheet, taken from the river that feeds it. */
  width: number
  /** Direction of travel in plan, so the sheet faces across the flow. */
  headingX: number
  headingZ: number
  /** Elevation of the pool at the foot. */
  poolY: number
}

export function buildWaterfalls(rivers: River[], c: IslandConfig = islandConfig): Waterfall[] {
  const w = c.waterfalls
  const out: Waterfall[] = []

  for (const river of rivers) {
    let i = 0
    while (i < river.length - 1) {
      if (river[i].drop < w.minDrop) {
        i++
        continue
      }
      // Absorb the whole steep run, so one cliff is one fall.
      const start = i
      let height = 0
      while (i < river.length - 1 && river[i].drop >= w.minDrop * 0.6) {
        height += river[i].drop
        i++
      }
      const top = river[start]
      const foot = river[Math.min(river.length - 1, i)]

      if (height < w.minHeight) continue

      const dx = foot.x - top.x
      const dz = foot.z - top.z
      const len = Math.hypot(dx, dz) || 1
      out.push({
        x: top.x,
        y: top.y,
        z: top.z,
        height,
        // A fall is narrower than the river that feeds it: water gathers as it
        // goes over the lip rather than spreading.
        width: Math.max(w.minWidth, top.halfWidth * 2 * 0.8),
        headingX: dx / len,
        headingZ: dz / len,
        poolY: foot.y,
      })
    }
  }

  // Biggest first, so a cap keeps the landmarks and drops the trickles.
  out.sort((a, b) => b.height - a.height)
  return out.slice(0, w.maxCount)
}
