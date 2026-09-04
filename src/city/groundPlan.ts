import { cityConfig, type CityConfig } from '@/config'
import { blockHalfExtent, nearSeam, seamCoord } from './cityLayout'
import { buildFacilities } from './civic'
import { buildParking } from './parking'
import { buildPlaygrounds } from './playgrounds'
import { themeParkPaving } from './themePark'
import { buildCrossings } from './paths'
import type { CityLayout, Crossing } from './types'

/**
 * The flat-pack plan of the urban ground (plan §§6–8).
 *
 * Pure rectangle lists — no Three.js — so the road surface, walkways and every
 * painted line can be unit-tested for the things that actually matter: paint
 * staying on asphalt, walkways staying off it, and nothing being laid across
 * the hero's plaza. The scene layer merges these into a handful of buffers.
 */

/** An axis-aligned rectangle lying flat on the ground at height `y`. */
export interface GroundQuad {
  cx: number
  cz: number
  halfW: number
  halfD: number
  y: number
}

/** An axis-aligned slab; its vertical sides form the kerb face. */
export interface GroundSlab {
  cx: number
  cz: number
  halfW: number
  halfD: number
  y0: number
  y1: number
}

export interface GroundPlan {
  asphalt: GroundQuad[]
  markings: GroundQuad[]
  walkways: GroundSlab[]
  plaza: GroundSlab
}

/**
 * Whether `v` is inside a junction, for suppressing paint. Shares `nearSeam`
 * with prop placement so paint and street furniture agree on where a junction
 * begins; the margin here is small because paint may run right up to the box.
 */
function insideJunction(v: number, c: CityConfig): boolean {
  // A full road-width of clearance, not one unit. This tested a dash's MIDPOINT
  // against the seam, so a six-unit dash could still straddle a junction — it
  // only ever passed because the uniform grid happened never to step a dash
  // into that band. Once block widths varied, one landed seven units off a seam
  // and painted through it. Real markings stop well back from a junction
  // anyway.
  return nearSeam(v, c.roads.mainHalfWidth + 1, c)
}

function buildAsphalt(layout: CityLayout, ew: number, ns: number): GroundQuad[] {
  return layout.roads.map((road) => {
    const along = (road.to - road.from) / 2
    const mid = (road.from + road.to) / 2
    const isEw = road.axis === 'ew'
    return {
      cx: isEw ? mid : road.center,
      cz: isEw ? road.center : mid,
      halfW: isEw ? along : road.halfWidth,
      halfD: isEw ? road.halfWidth : along,
      y: isEw ? ew : ns,
    }
  })
}

/**
 * Dashed centre lines, but only on the roads near the tower.
 *
 * Painting every road out to the mid ring would add thousands of quads that
 * are sub-pixel from any real camera position — this is the cheapest honest
 * level-of-detail cut available (plan §12).
 */
function buildCentreLines(c: CityConfig, y: number): GroundQuad[] {
  const out: GroundQuad[] = []
  const reach = seamCoord(c.grid.innerRadius, c) + c.grid.pitch / 2
  const half = c.roads.markingWidth / 2
  const dash = 6
  const gap = 6

  for (let b = -c.grid.innerRadius - 1; b <= c.grid.innerRadius; b++) {
    const center = seamCoord(b, c)
    if (Math.abs(center) > reach) continue
    for (let p = -reach; p < reach; p += dash + gap) {
      const mid = p + dash / 2
      // Centre lines stop at junctions; paint running through an intersection
      // is the detail that makes a procedural road look fake.
      if (insideJunction(mid, c)) continue
      out.push({ cx: mid, cz: center, halfW: dash / 2, halfD: half, y })
      out.push({ cx: center, cz: mid, halfW: half, halfD: dash / 2, y })
    }
  }
  return out
}

/** Zebra bars, elongated along the pedestrian's direction of travel. */
function buildZebras(crossings: Crossing[], c: CityConfig, y: number): GroundQuad[] {
  const out: GroundQuad[] = []
  const stripes = 5
  const barHalf = c.roads.crossingDepth / (stripes * 2 * 2)

  for (const crossing of crossings) {
    for (let i = 0; i < stripes; i++) {
      const t = (i + 0.5) / stripes - 0.5
      const offset = t * c.roads.crossingDepth
      if (crossing.axis === 'ew') {
        // Crosses an east–west road: bars span the asphalt in z.
        out.push({
          cx: crossing.center.x + offset,
          cz: crossing.center.z,
          halfW: barHalf,
          halfD: crossing.halfWidth,
          y,
        })
      } else {
        out.push({
          cx: crossing.center.x,
          cz: crossing.center.z + offset,
          halfW: crossing.halfWidth,
          halfD: barHalf,
          y,
        })
      }
    }
  }
  return out
}

/** Stop bars, one per approach, on the junction side of each crossing. */
function buildStopBars(crossings: Crossing[], c: CityConfig, y: number): GroundQuad[] {
  const half = c.roads.markingWidth
  return crossings.map((crossing) => {
    // Sit just outside the zebra, away from the junction centre.
    const away = Math.sign(
      crossing.axis === 'ew'
        ? crossing.center.x - seamCoordNearest(crossing.center.x, c)
        : crossing.center.z - seamCoordNearest(crossing.center.z, c),
    )
    const shift = (crossing.depth / 2 + half) * (away || 1)
    if (crossing.axis === 'ew') {
      return {
        cx: crossing.center.x + shift,
        cz: crossing.center.z,
        halfW: half,
        halfD: crossing.halfWidth,
        y,
      }
    }
    return {
      cx: crossing.center.x,
      cz: crossing.center.z + shift,
      halfW: crossing.halfWidth,
      halfD: half,
      y,
    }
  })
}

function seamCoordNearest(v: number, c: CityConfig): number {
  let best = 0
  let bestGap = Infinity
  for (let b = -c.grid.midRadius - 1; b <= c.grid.midRadius; b++) {
    const s = seamCoord(b, c)
    const gap = Math.abs(v - s)
    if (gap < bestGap) {
      bestGap = gap
      best = s
    }
  }
  return best
}

function buildWalkways(layout: CityLayout, kerbTop: number): GroundSlab[] {
  return layout.sidewalks.map((walk) => {
    const along = (walk.to - walk.from) / 2
    const mid = (walk.from + walk.to) / 2
    const isEw = walk.axis === 'ew'
    return {
      cx: isEw ? mid : walk.center,
      cz: isEw ? walk.center : mid,
      halfW: isEw ? along : walk.width / 2,
      halfD: isEw ? walk.width / 2 : along,
      y0: 0,
      // North–south walkways sit a hair lower so overlapping corners at every
      // junction resolve to one surface instead of z-fighting.
      y1: isEw ? kerbTop : kerbTop - 0.002,
    }
  })
}

/** Build the whole ground plan. Pure and deterministic. */
export function buildGroundPlan(
  layout: CityLayout,
  layers: {
    asphaltEw: number
    asphaltNs: number
    markings: number
    kerbTop: number
  },
  c: CityConfig = cityConfig,
): GroundPlan {
  const crossings = buildCrossings(c)
  const half = blockHalfExtent(c)

  return {
    // Facility car parks and drop-offs ride in the road surface's own buffer:
    // they are the same material, and the environment has two draw calls left.
    asphalt: [
      ...buildAsphalt(layout, layers.asphaltEw, layers.asphaltNs),
      ...buildFacilities(c).flatMap((f) =>
        f.aprons.map((a) => ({ ...a, y: layers.asphaltEw })),
      ),
      ...themeParkPaving(c, layers.asphaltEw),
      ...buildParking(layout, c).map((lot) => ({ ...lot, y: layers.asphaltEw })),
      // A playground's own surface. Square, because the equipment stands on it
      // and a jittered outline would leave a swing on the grass.
      ...buildPlaygrounds(c).map((p) => ({
        cx: p.centre.x,
        cz: p.centre.z,
        halfW: p.radius * 0.8,
        halfD: p.radius * 0.8,
        y: layers.asphaltEw,
      })),
    ],
    markings: [
      ...buildCentreLines(c, layers.markings),
      ...buildZebras(crossings, c, layers.markings),
      ...buildStopBars(crossings, c, layers.markings),
    ],
    walkways: buildWalkways(layout, layers.kerbTop),
    plaza: {
      cx: 0,
      cz: 0,
      halfW: half,
      halfD: half,
      y0: 0,
      y1: layers.kerbTop,
    },
  }
}
