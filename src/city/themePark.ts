import { cityConfig, roadReserve, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { blockCenter, seamCoord } from './cityLayout'
import { facilityAt } from './civic'
import type { AttractionKind, BlockCoord, ThemePark, Vec2 } from './types'
import { onMajorRoad, urbanityAt, zoneAt } from './zoning'

/**
 * The theme park (§15 of the city brief).
 *
 * "Keep the attractions concentrated inside a defined park boundary" and
 * "avoid making the theme park look like a collection of random objects" are
 * the same requirement, and the way to satisfy both is to lay it out the way a
 * real park is: everything hangs off a midway.
 *
 * A spine runs from the entrance across the site, wandering rather than
 * straight, and the attractions stand alternately either side of it with the
 * stalls between them. Nothing is placed at a radius or a bearing — the
 * position of every ride is "so far along the path, so far off it", which is
 * what makes the finished thing read as somewhere you could walk through.
 *
 * It takes ONE block rather than several. Blocks out at this distance are up
 * to four hundred units across, which is a real park; spanning more would mean
 * either building over a street or pretending one is not there.
 */

/** Ride mix along the midway, in the order they are met walking in. */
const SEQUENCE: readonly AttractionKind[] = [
  'carousel',
  'wheel',
  'stall',
  'coaster',
  'stall',
  'tower',
  'carousel',
  'stall',
  'wheel',
]

function siteScore(block: BlockCoord, c: CityConfig): number {
  if (facilityAt(block, c)) return 0
  const zone = zoneAt(block, c)
  if (zone !== 'park' && zone !== 'undeveloped') return 0
  // Out where there is room for it, and reachable: a theme park nobody can
  // drive to is a field with a ferris wheel in it.
  if (urbanityAt(block, c) < c.themePark.minReach) return 0
  if (!onMajorRoad(block, c)) return 0
  const reserve = roadReserve(true, c)
  const w = Math.abs(seamCoord(block.bx, c) - seamCoord(block.bx - 1, c)) - reserve * 2
  const d = Math.abs(seamCoord(block.bz, c) - seamCoord(block.bz - 1, c)) - reserve * 2
  return Math.min(w, d) < c.themePark.minSpan ? 0 : w * d
}

let cache: { park: ThemePark | null; config: CityConfig } | null = null

export function buildThemePark(c: CityConfig = cityConfig): ThemePark | null {
  if (cache?.config === c) return cache.park

  const r = c.grid.midRadius
  let best: { block: BlockCoord; score: number } | null = null
  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      const score = siteScore(block, c)
      // Ties broken on the index, so the choice cannot depend on scan order.
      if (score > 0 && (!best || score > best.score)) best = { block, score }
    }
  }
  if (!best) {
    cache = { park: null, config: c }
    return null
  }

  const t = c.themePark
  const block = best.block
  const reserve = roadReserve(true, c) + t.inset
  const minX = seamCoord(block.bx - 1, c) + reserve
  const maxX = seamCoord(block.bx, c) - reserve
  const minZ = seamCoord(block.bz - 1, c) + reserve
  const maxZ = seamCoord(block.bz, c) - reserve
  const centre = blockCenter(block, c)
  const rng = rngFrom(`${c.seed}:themepark`)

  // The midway runs along the longer axis, entered from the near end.
  const alongX = maxX - minX >= maxZ - minZ
  const span = alongX ? maxX - minX : maxZ - minZ
  const across = alongX ? maxZ - minZ : maxX - minX
  const entryAtLow = rng.chance(0.5)

  /** A point `u` along the midway (0 at the gate, 1 at the far end), `v` off it. */
  const at = (u: number, v: number): Vec2 => {
    const alongCoord = entryAtLow ? u : 1 - u
    const a = (alongX ? minX : minZ) + alongCoord * span
    const b = (alongX ? minZ : minX) + across / 2 + v
    return alongX ? { x: a, z: b } : { x: b, z: a }
  }

  // The gate end: ticket office on the street, car park beside it.
  const gate = at(t.gateAt, 0)
  // Pushed in from the gate by its own half-length: placed level with the gate
  // it overhung the block, because the gate is nearer the street than the car
  // park is wide.
  const parkingCentre = at(t.gateAt + t.parking.alongHalf, across * t.parking.offset)

  const attractions = SEQUENCE.map((kind, i) => {
    const u = t.firstStop + (i / (SEQUENCE.length - 1)) * (t.lastStop - t.firstStop)
    // Alternating sides with a jittered offset: a midway with everything on
    // one side is a street, not a park.
    const side = i % 2 === 0 ? 1 : -1
    const size = t.sizes[kind]
    // Clamped to what the site can hold. The offset is a fraction of the
    // width, so on a narrow block a big ride's own radius took it over the
    // boundary — the fraction fits, the wheel does not.
    const room = Math.max(0, across / 2 - size.radius.max - t.inset)
    const v = side * Math.min(across * rng.range(t.offset.min, t.offset.max), room)
    // And along the midway too. The last stop is a twentieth of the site from
    // the far fence, which is less than a big wheel's radius — clamped across
    // but not along, a ride still walked out of its own park.
    const margin = (size.radius.max + t.inset) / span
    const along = Math.min(
      1 - margin,
      Math.max(margin, u + rng.range(-t.jitter, t.jitter)),
    )
    return {
      id: `ride:${kind}:${i}`,
      kind,
      position: at(along, v),
      radius: rng.range(size.radius.min, size.radius.max),
      height: rng.range(size.height.min, size.height.max),
      rotationY: rng.range(0, Math.PI * 2),
      variant: rng.next(),
    }
  })

  const park: ThemePark = {
    block,
    bounds: { cx: centre.x, cz: centre.z, halfW: (maxX - minX) / 2, halfD: (maxZ - minZ) / 2 },
    gate,
    gateRotationY: alongX ? (entryAtLow ? -Math.PI / 2 : Math.PI / 2) : entryAtLow ? Math.PI : 0,
    parking: {
      cx: parkingCentre.x,
      cz: parkingCentre.z,
      halfW: alongX ? span * t.parking.alongHalf : across * t.parking.acrossHalf,
      halfD: alongX ? across * t.parking.acrossHalf : span * t.parking.alongHalf,
    },
    // The midway itself, as a run of paving. Sampled rather than analytic so a
    // curve costs the same as a straight line.
    path: Array.from({ length: t.pathSteps }, (_, i) => {
      const u = t.firstStop - 0.06 + (i / (t.pathSteps - 1)) * (t.lastStop - t.firstStop + 0.12)
      return at(u, Math.sin(u * Math.PI * 1.7) * across * t.meander)
    }),
    attractions,
  }

  cache = { park, config: c }
  return park
}

/** True when a block is the theme park's site. */
export function isThemeParkBlock(block: BlockCoord, c: CityConfig = cityConfig): boolean {
  const park = buildThemePark(c)
  return !!park && park.block.bx === block.bx && park.block.bz === block.bz
}

/**
 * The park's hard surfaces: its car park and the midway.
 *
 * Emitted as ordinary ground quads so they ride in the road buffer — the
 * midway is paving, and paving is what the asphalt layer draws.
 */
export function themeParkPaving(
  c: CityConfig = cityConfig,
  y = 0.01,
): { cx: number; cz: number; halfW: number; halfD: number; y: number }[] {
  const park = buildThemePark(c)
  if (!park) return []
  const out = [{ ...park.parking, y }]
  const half = c.themePark.pathWidth / 2
  // The midway as a run of overlapping squares along its polyline. A ribbon
  // would be truer but would need its own buffer; at this width the squares
  // read as a continuous path and cost the same as the quads around them.
  for (let i = 0; i < park.path.length - 1; i++) {
    const a = park.path[i]
    const b = park.path[i + 1]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / half))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      out.push({
        cx: a.x + (b.x - a.x) * t,
        cz: a.z + (b.z - a.z) * t,
        halfW: half,
        halfD: half,
        y,
      })
    }
  }
  return out
}
