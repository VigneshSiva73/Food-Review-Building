import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { HeightField } from './heightField'
import { leastCostFrom, nodeAt, roadNodes, traceHome, type Road } from './roads'
import type { Waterfall } from './waterfalls'

/**
 * Walking trails, from the roads out to the places worth walking to.
 *
 * §23 and §24: paths to waterfalls, viewpoints and beaches, narrower than roads
 * and ending AT something. They use the same least-cost search the roads do —
 * so a trail can never disagree with a road about what the terrain costs — with
 * two differences that are the whole character of a footpath.
 *
 * A walker climbs. The gradient penalty is a fraction of the roads', so a trail
 * takes the direct line up a slope a road would have to switchback around, and
 * a stream is a stepping stone rather than a bridge.
 *
 * And they start FROM the road network rather than from the city, because that
 * is what a trailhead is. Seeding the search with every road node at once means
 * each path leaves the road nearest it without anything working out which road
 * that should be.
 */

export interface Trailhead {
  x: number
  z: number
  kind: 'waterfall' | 'viewpoint' | 'beach'
}

export type Trail = ReturnType<typeof traceHome>

/**
 * Viewpoints: the local high points, spread out.
 *
 * A prominence people would actually walk to, not merely the summit — the
 * highest ground on the island is one place, and a trail network needs several.
 * Candidates are the highest nodes kept apart by a minimum spacing.
 */
function viewpoints(field: HeightField, c: IslandConfig): Trailhead[] {
  const t = c.trails
  const candidates: { x: number; z: number; h: number }[] = []
  const stride = 6
  for (let j = stride; j < field.size - stride; j += stride) {
    for (let i = stride; i < field.size - stride; i += stride) {
      const n = j * field.size + i
      const h = field.height[n]
      if (h < t.viewpointHeight) continue
      candidates.push({
        x: -field.half + i * field.step,
        z: -field.half + j * field.step,
        h,
      })
    }
  }
  candidates.sort((a, b) => b.h - a.h)

  const chosen: Trailhead[] = []
  for (const cand of candidates) {
    if (chosen.length >= t.maxViewpoints) break
    if (chosen.some((v) => Math.hypot(v.x - cand.x, v.z - cand.z) < t.viewpointSpacing)) continue
    chosen.push({ x: cand.x, z: cand.z, kind: 'viewpoint' })
  }
  return chosen
}

/** Beaches worth walking to: gentle sand, kept apart. */
function beaches(field: HeightField, c: IslandConfig): Trailhead[] {
  const t = c.trails
  const chosen: Trailhead[] = []
  const stride = 5
  for (let j = stride; j < field.size - stride; j += stride) {
    for (let i = stride; i < field.size - stride; i += stride) {
      if (chosen.length >= t.maxBeaches) return chosen
      const n = j * field.size + i
      const h = field.height[n]
      const above = h - c.world.seaLevel
      if (above < 6 || above > t.beachAbove) continue
      if (field.shoreDistance[n] * field.step > t.beachReach) continue
      if (field.shelf[n] > 0.02) continue
      const x = -field.half + i * field.step
      const z = -field.half + j * field.step
      if (chosen.some((b) => Math.hypot(b.x - x, b.z - z) < t.beachSpacing)) continue
      chosen.push({ x, z, kind: 'beach' })
    }
  }
  return chosen
}

export function trailheads(
  field: HeightField,
  falls: Waterfall[],
  c: IslandConfig = islandConfig,
): Trailhead[] {
  const t = c.trails
  return [
    // The biggest falls are landmarks; the small ones are scenery.
    ...falls.slice(0, t.maxWaterfalls).map((f) => ({
      x: f.x,
      z: f.z,
      kind: 'waterfall' as const,
    })),
    ...viewpoints(field, c),
    ...beaches(field, c),
  ]
}

export function buildTrails(
  field: HeightField,
  roads: Road[],
  falls: Waterfall[],
  c: IslandConfig = islandConfig,
): Trail[] {
  const t = c.trails
  const seeds = roadNodes(field, roads, c)
  if (seeds.size === 0) return []

  const cost = leastCostFrom(field, seeds, t, c)
  const traffic = new Map<number, number>()
  const out: Trail[] = []

  for (const head of trailheads(field, falls, c)) {
    const chain = traceHome(field, cost, nodeAt(field, cost, head.x, head.z), traffic, t.maxSteps)
    // A path that is already at a road is not a trail.
    if (chain.length >= t.minPoints) out.push(chain)
  }
  return out
}
