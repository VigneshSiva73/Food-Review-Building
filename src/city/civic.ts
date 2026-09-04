import { cityConfig, roadReserve, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { blockCenter, seamCoord } from './cityLayout'
import type { BlockCoord, CivicFacility, CivicKind, Vec2 } from './types'
import { onMajorRoad, urbanityAt, zoneAt } from './zoning'

/**
 * The city's public facilities: a hospital, its schools, a shopping centre and
 * its playing fields (§§12–14 and §18 of the city brief).
 *
 * These are the one part of the city that is NOT generated from a field. A
 * hospital is not a probability, it is a decision somebody made about a
 * particular site, and the brief is explicit about what the decision depends
 * on: a hospital must be on a major road and never in the middle of a
 * residential street; a school belongs among the houses; a shopping centre
 * wants a main road and a big parcel. So each kind scores every block against
 * its own rules and takes the best ones that are far enough apart.
 *
 * That is also why they come first. A facility claims its whole block, and the
 * house layout, the plot buildings, the block planting and the grass all ask
 * this module what it has taken before they place anything.
 */

interface Candidate {
  block: BlockCoord
  centre: Vec2
  width: number
  depth: number
  major: boolean
  reach: number
  zone: ReturnType<typeof zoneAt>
}

function candidates(c: CityConfig): Candidate[] {
  const r = c.grid.midRadius
  const reserve = roadReserve(true, c)
  const out: Candidate[] = []
  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      // The tower's own block is never anything but the plaza.
      if (bx === 0 && bz === 0) continue
      const width = Math.abs(seamCoord(bx, c) - seamCoord(bx - 1, c)) - reserve * 2
      const depth = Math.abs(seamCoord(bz, c) - seamCoord(bz - 1, c)) - reserve * 2
      out.push({
        block,
        centre: blockCenter(block, c),
        width,
        depth,
        major: onMajorRoad(block, c),
        reach: urbanityAt(block, c),
        zone: zoneAt(block, c),
      })
    }
  }
  return out
}

/** How well a block suits each kind. Zero means "not here". */
const SCORES: Readonly<Record<CivicKind, (b: Candidate, c: CityConfig) => number>> = Object.freeze({
  // "Connected directly to a major road", and big enough to hold a hospital
  // and its car park. Out of the core, where the land is towers.
  hospital: (b) => {
    if (!b.major) return 0
    if (b.zone !== 'commercial' && b.zone !== 'mixed' && b.zone !== 'residential') return 0
    if (b.reach < 3.5) return 0
    return b.width * b.depth
  },
  // "Schools in residential areas", and off the arterials — a school gate on a
  // main road is exactly what the brief says not to build.
  school: (b) => {
    if (b.zone !== 'residential' && b.zone !== 'suburban') return 0
    return b.width * b.depth * (b.major ? 0.35 : 1)
  },
  // One larger shopping zone: main road, big parcel, commercial land.
  shopping: (b) => {
    if (!b.major) return 0
    if (b.zone !== 'commercial') return 0
    if (b.reach < 3) return 0
    return b.width * b.depth
  },
  // Playing fields go on green land, near the houses that use them.
  sports: (b) => {
    if (b.zone !== 'park') return 0
    // Not on the tower's own forecourt, which is parkland for a different
    // reason and would happily score as the largest green site in the city.
    if (b.reach < 2) return 0
    return b.width * b.depth * (b.reach > 4 ? 1 : 0.4)
  },
  // Filling stations sit on a main road wherever the traffic is, and prefer a
  // SMALL parcel — a forecourt is a corner site, not a city block, so scoring
  // by area the way the others do would put one on the largest plot in town.
  fuel: (b) => {
    if (!b.major) return 0
    if (b.zone === 'core' || b.zone === 'park') return 0
    if (b.reach < 2.5) return 0
    return 1 / (1 + b.width * b.depth * 1e-5)
  },
})

/** Order matters: the scarcer and more constrained a kind, the earlier it picks. */
const ORDER: readonly CivicKind[] = ['shopping', 'hospital', 'fuel', 'school', 'sports']

/**
 * Lay a facility out inside its block.
 *
 * Three bands across the block's longer axis — building, hard standing, grass
 * — in proportions set by what the thing is. A school is mostly playing field
 * with a low building on the street; a shopping centre is mostly car park. The
 * building always takes the band nearest the street it fronts, which is what
 * gives every one of these a real entrance rather than a back elevation.
 */
function layout(kind: CivicKind, b: Candidate, c: CityConfig): CivicFacility {
  const spec = c.civic.kinds[kind]
  const rng = rngFrom(`${c.seed}:civic:${kind}:${b.block.bx}:${b.block.bz}`)
  // Along the longer axis, so the bands are as wide as the block allows.
  const alongX = b.width >= b.depth
  const span = alongX ? b.width : b.depth
  const across = alongX ? b.depth : b.width
  // Which end the building sits at, so they are not all on the same side.
  const flip = rng.chance(0.5) ? 1 : -1

  const band = (from: number, to: number) => {
    const mid = (from + to) / 2 - span / 2
    const half = (to - from) / 2
    const offset = mid * flip
    return alongX
      ? { cx: b.centre.x + offset, cz: b.centre.z, halfW: half, halfD: across / 2 }
      : { cx: b.centre.x, cz: b.centre.z + offset, halfW: across / 2, halfD: half }
  }

  const buildEnd = span * spec.buildingShare
  const apronEnd = buildEnd + span * spec.apronShare
  const built = band(0, buildEnd)
  const apron = spec.apronShare > 0 ? [band(buildEnd, apronEnd)] : []
  const green = spec.greenShare > 0 ? [band(apronEnd, span)] : []

  const floors = rng.int(spec.floors.min, spec.floors.max)
  return {
    id: `civic:${kind}:${b.block.bx}:${b.block.bz}`,
    kind,
    block: b.block,
    building:
      spec.buildingShare > 0
        ? {
            position: { x: built.cx, z: built.cz },
            // Set in from the band it occupies, so it has landscaping around
            // it rather than filling its site to the kerb.
            width: built.halfW * 2 * spec.footprint,
            depth: built.halfD * 2 * spec.footprint,
            floors,
            height: floors * c.buildings.storeyHeight,
            rotationY: alongX ? 0 : Math.PI / 2,
          }
        : null,
    aprons: apron,
    greens: green,
  }
}

let cache: { list: CivicFacility[]; config: CityConfig } | null = null

/** Every public facility in the city. Memoised: several builders ask for it. */
export function buildFacilities(c: CityConfig = cityConfig): CivicFacility[] {
  if (cache?.config === c) return cache.list

  const pool = candidates(c)
  const taken = new Set<string>()
  const out: CivicFacility[] = []

  for (const kind of ORDER) {
    const spec = c.civic.kinds[kind]
    const score = SCORES[kind]
    const ranked = pool
      .map((b) => ({ b, s: score(b, c) }))
      .filter((e) => e.s > 0)
      // Ties broken on the block index, so the result cannot depend on the
      // order the candidates happened to be enumerated in.
      .sort((p, q) => q.s - p.s || p.b.block.bx - q.b.block.bx || p.b.block.bz - q.b.block.bz)

    let placed = 0
    for (const { b } of ranked) {
      if (placed >= spec.count) break
      const key = `${b.block.bx}:${b.block.bz}`
      if (taken.has(key)) continue
      // Kept apart, so the city has a school in each neighbourhood rather than
      // four of them on one street.
      if (out.some((f) => f.kind === kind && distance(f.block, b.block, c) < spec.spacing)) continue
      taken.add(key)
      out.push(layout(kind, b, c))
      placed++
    }
  }

  cache = { list: out, config: c }
  return out
}

function distance(a: BlockCoord, b: BlockCoord, c: CityConfig): number {
  const p = blockCenter(a, c)
  const q = blockCenter(b, c)
  return Math.hypot(p.x - q.x, p.z - q.z)
}

let blockCache: { map: Map<string, CivicKind>; config: CityConfig } | null = null

/** Which facility, if any, has claimed a block. */
export function facilityAt(block: BlockCoord, c: CityConfig = cityConfig): CivicKind | null {
  if (blockCache?.config !== c) {
    const map = new Map<string, CivicKind>()
    for (const f of buildFacilities(c)) map.set(`${f.block.bx}:${f.block.bz}`, f.kind)
    blockCache = { map, config: c }
  }
  return blockCache.map.get(`${block.bx}:${block.bz}`) ?? null
}
