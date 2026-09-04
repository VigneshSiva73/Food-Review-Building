import { cityConfig, roadReserve, type CityConfig, type CityRing } from '@/config'
import type {
  BlockCoord,
  CityLayout,
  Intersection,
  Plot,
  RoadClass,
  RoadSegment,
  SidewalkStrip,
  Vec2,
} from './types'
import { rngFrom } from '@/utils/rng'

/**
 * The urban grid (plan §D).
 *
 * A plain Manhattan grid centred on the hero building: block centres sit at
 * multiples of `grid.pitch`, road centrelines run down the seams half a pitch
 * either side. Block (0, 0) is the hero's plaza and is never built on.
 *
 * Everything is derived — plaza extent comes from the pitch minus the road
 * reserve, so widening a road can never silently push asphalt into the plaza.
 */

/**
 * Width of the block at index `b`, seeded.
 *
 * The grid used to be one pitch everywhere, which made every block the same
 * square and read — correctly — as a sheet of graph paper. Real street grids
 * are regular in DIRECTION and irregular in spacing: the avenues run parallel,
 * but the blocks between them are all different depths.
 *
 * Seeded per index rather than per block, so a whole avenue keeps one spacing
 * down its length. Varying it per block would bend the streets, which is a
 * different city entirely.
 */
export function blockSpan(b: number, c: CityConfig = cityConfig): number {
  // The hero's own block is fixed: the plaza's size is a designed quantity, not
  // something to roll dice on. It is also the widest block in the city, since
  // it is sized to the building rather than to the street grid.
  if (b === 0) return c.grid.pitch * c.grid.plazaBlocks
  const rng = rngFrom(`${c.seed}:span:${b}`)
  // Drawn from CLASSES, not from a uniform range. A uniform draw does vary the
  // widths — but most samples land near the middle of it, so the grid still
  // reads as regular with a couple of odd blocks. Real cities have distinctly
  // short blocks and distinctly long ones, and picking a class first is what
  // produces that rather than a cloud around the average.
  const roll = rng.next()
  let band = c.grid.spanBands[c.grid.spanBands.length - 1]
  let cumulative = 0
  for (const candidate of c.grid.spanBands) {
    cumulative += candidate.share
    if (roll <= cumulative) {
      band = candidate
      break
    }
  }
  return c.grid.pitch * rng.range(band.min, band.max)
}

/**
 * Seam positions, accumulated once.
 *
 * With varying block widths a seam is no longer a multiple of anything, so the
 * positions are summed outward from the hero's block and cached. Everything
 * that asks where a road is — paint, kerbs, lamps, crossings, traffic — reads
 * this, so they cannot disagree about where the street went.
 */
let seamCache: { seams: Map<number, number>; config: CityConfig } | null = null

function seams(c: CityConfig): Map<number, number> {
  // Keyed on the config OBJECT, not on a string built from it. Building a key
  // meant stringifying the span bands on every call — and `seamCoord` is asked
  // thousands of times per layout, so that alone took the road tests from
  // milliseconds to over five seconds. Configs are frozen module constants;
  // identity is exactly the right comparison and it is free.
  if (seamCache?.config === c) return seamCache.seams

  const map = new Map<number, number>()
  const reach = c.grid.midRadius + 2
  // Outward from the plaza's own edges in both directions.
  let positive = blockSpan(0, c) / 2
  map.set(0, positive)
  for (let b = 1; b <= reach; b++) {
    positive += blockSpan(b, c)
    map.set(b, positive)
  }
  let negative = -blockSpan(0, c) / 2
  map.set(-1, negative)
  for (let b = 2; b <= reach + 1; b++) {
    negative -= blockSpan(-b + 1, c)
    map.set(-b, negative)
  }

  seamCache = { seams: map, config: c }
  return map
}

/** Centreline coordinate of the road on the seam after block index `b`. */
export function seamCoord(b: number, c: CityConfig = cityConfig): number {
  const map = seams(c)
  const hit = map.get(b)
  if (hit !== undefined) return hit
  // Past the built grid: fall back to the nominal pitch so anything scanning a
  // wide range still gets a monotonic answer.
  const edge = b > 0 ? c.grid.midRadius + 2 : -(c.grid.midRadius + 3)
  return (map.get(edge) ?? 0) + (b - edge) * c.grid.pitch
}

/** Centre of a block in world coordinates. */
export function blockCenter(block: BlockCoord, c: CityConfig = cityConfig): Vec2 {
  return {
    x: (seamCoord(block.bx - 1, c) + seamCoord(block.bx, c)) / 2,
    z: (seamCoord(block.bz - 1, c) + seamCoord(block.bz, c)) / 2,
  }
}

/**
 * How far the detailed street grid reaches from the tower. Used to scale the
 * atmosphere: the haze is otherwise keyed to the building's height, which
 * shrinks with the day filter and would swallow the streets.
 */
export function districtReach(c: CityConfig = cityConfig): number {
  return seamCoord(c.grid.innerRadius, c) + c.grid.pitch / 2
}

/**
 * How far the streets run, which is how far the tower's shadow has to be able
 * to land. Distinct from `districtReach`, which is about haze and keys to the
 * detailed inner ring only.
 */
export function districtShadowReach(c: CityConfig = cityConfig): number {
  return Math.max(Math.abs(seamCoord(c.grid.midRadius, c)), Math.abs(seamCoord(-c.grid.midRadius - 1, c)))
}

/** Chebyshev distance from the hero's block — the ring index. */
export function blockRing(block: BlockCoord): number {
  return Math.max(Math.abs(block.bx), Math.abs(block.bz))
}

/** A road is a main avenue when it borders the hero's block. */
export function isMainSeam(b: number): boolean {
  return b === 0 || b === -1
}

/**
 * Where the seam road at block index `b` sits in the hierarchy.
 *
 * Counted OUTWARD FROM THE PLAZA, not from index zero. The index runs 0, 1, 2
 * on one side and -2, -3, -4 on the other, so `b % n` would put the arterials
 * at different distances either side of the tower and the grid would read as
 * subtly lopsided without anything obviously wrong with it.
 */
export function seamClass(b: number, c: CityConfig = cityConfig): RoadClass {
  if (isMainSeam(b)) return 'main'
  const outward = b >= 0 ? b : -b - 1
  return outward % c.roads.arterialEvery === 0 ? 'arterial' : 'secondary'
}

/** Asphalt half-width of the seam road at block index `b`. */
export function seamHalfWidth(b: number, c: CityConfig = cityConfig): number {
  const width = c.roads
  const cls = seamClass(b, c)
  return cls === 'main'
    ? width.mainHalfWidth
    : cls === 'arterial'
      ? width.arterialHalfWidth
      : width.secondaryHalfWidth
}

/**
 * True when `v` lies within `clearance` of any seam road's asphalt.
 *
 * The one place that decides what counts as "in a junction". Road paint, tree
 * pits and lamp posts all ask this question, and they have to agree: a lamp
 * standing where the centre line was suppressed is exactly the sort of
 * mismatch that makes a procedural street read as generated.
 */
export function nearSeam(v: number, clearance: number, c: CityConfig = cityConfig): boolean {
  for (let b = -c.grid.midRadius - 1; b <= c.grid.midRadius; b++) {
    if (Math.abs(v - seamCoord(b, c)) <= seamHalfWidth(b, c) + clearance) return true
  }
  return false
}

/**
 * Clear half-extent of a block's interior: half the pitch, less the reserve of
 * the widest road that can border it. Using the widest keeps every block
 * rectangular and guarantees no plot ever overlaps asphalt or sidewalk.
 */
export function blockHalfExtent(c: CityConfig = cityConfig): number {
  // The PLAZA's block, which is the one every caller of this actually means:
  // the forecourt, its bollards, its paving. Block zero is deliberately fixed
  // while every other block's width is rolled, so this is a designed number
  // rather than a seeded one.
  return blockSpan(0, c) / 2 - roadReserve(true, c)
}

/** Clear half-extent of one specific block, which is what a plot needs. */
export function blockHalfExtentAt(block: BlockCoord, c: CityConfig = cityConfig): Vec2 {
  return {
    x: Math.abs(seamCoord(block.bx, c) - seamCoord(block.bx - 1, c)) / 2 - roadReserve(true, c),
    z: Math.abs(seamCoord(block.bz, c) - seamCoord(block.bz - 1, c)) / 2 - roadReserve(true, c),
  }
}

function buildRoads(c: CityConfig): RoadSegment[] {
  const roads: RoadSegment[] = []
  const r = c.grid.midRadius
  // Roads span the whole mid-ring extent plus one seam beyond, so the grid
  // reads as continuing past the modelled blocks rather than stopping dead.
  const reach = seamCoord(r, c)

  for (let b = -r - 1; b <= r; b++) {
    const center = seamCoord(b, c)
    const roadClass = seamClass(b, c)
    const halfWidth = seamHalfWidth(b, c)
    roads.push({
      id: `road-ew-${b}`,
      axis: 'ew',
      center,
      from: -reach,
      to: reach,
      roadClass,
      halfWidth,
    })
    roads.push({
      id: `road-ns-${b}`,
      axis: 'ns',
      center,
      from: -reach,
      to: reach,
      roadClass,
      halfWidth,
    })
  }
  return roads
}

function buildIntersections(c: CityConfig): Intersection[] {
  const out: Intersection[] = []
  const r = c.grid.midRadius
  for (let bx = -r - 1; bx <= r; bx++) {
    for (let bz = -r - 1; bz <= r; bz++) {
      const x = seamCoord(bx, c)
      const z = seamCoord(bz, c)
      const halfWidth = Math.max(seamHalfWidth(bx, c), seamHalfWidth(bz, c))
      // The four corners of the hero's block get signals; nothing else needs
      // them, and every extra signalled junction is another animated group.
      const signalled = isMainSeam(bx) && isMainSeam(bz)
      out.push({ id: `xing-${bx}-${bz}`, center: { x, z }, halfWidth, signalled })
    }
  }
  return out
}

function buildSidewalks(roads: RoadSegment[], c: CityConfig): SidewalkStrip[] {
  const out: SidewalkStrip[] = []
  const w = c.roads.sidewalkWidth
  for (const road of roads) {
    for (const side of [-1, 1] as const) {
      out.push({
        id: `walk-${road.id}-${side > 0 ? 'p' : 'n'}`,
        axis: road.axis,
        center: road.center + side * (road.halfWidth + w / 2),
        from: road.from,
        to: road.to,
        width: w,
        // Carried so anything placed on the walkway knows which way the kerb
        // faces without having to look its road back up.
        side,
        roadCenter: road.center,
        roadClass: road.roadClass,
      })
    }
  }
  return out
}

function ringOf(block: BlockCoord, c: CityConfig): CityRing | null {
  const ring = blockRing(block)
  if (ring === 0) return null // the plaza — never built on
  if (ring <= c.grid.innerRadius) return 'inner'
  if (ring <= c.grid.midRadius) return 'mid'
  return null
}

/**
 * Subdivide a block into parcels.
 *
 * A grid sized to a target frontage rather than a count of one or two. Two
 * buildings on a three-hundred-unit block is not a city block, it is a pair of
 * objects in a field, and it was the reason the district read as sparse
 * however many blocks were built on: there were only ever five hundred parcels
 * in the whole city.
 *
 * The parcels follow the block's SHAPE now. The old code took the smaller of
 * the two half-extents and used it for both, so an oblong block got a square
 * buildable area and threw away the whole of its long dimension — and block
 * spans deliberately vary between 130 and 410, so that was a great deal of
 * ground.
 *
 * The target is deliberately generous: about one parcel per hundred units, so
 * a typical block yields four rather than one and a large one yields nine. How
 * many are BUILT on is still the zoning's business — downtown fills its blocks
 * and the outskirts leave most of theirs, from the same subdivision.
 */
function plotsForBlock(block: BlockCoord, ring: CityRing, c: CityConfig): Plot[] {
  const extent = blockHalfExtentAt(block, c)
  const halfW = extent.x - c.buildings.plotSetback
  const halfD = extent.z - c.buildings.plotSetback
  if (halfW <= 0 || halfD <= 0) return []

  const center = blockCenter(block, c)
  const target = ring === 'inner' ? c.buildings.parcelInner : c.buildings.parcelMid
  const gap = c.buildings.plotGap
  const cols = Math.max(1, Math.round((halfW * 2) / target))
  const rows = Math.max(1, Math.round((halfD * 2) / target))
  const cellW = (halfW * 2 - gap * (cols - 1)) / cols
  const cellD = (halfD * 2 - gap * (rows - 1)) / rows
  if (cellW <= 1 || cellD <= 1) return []

  const out: Plot[] = []
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      out.push({
        id: `plot-${block.bx}-${block.bz}-${r * cols + col}`,
        block,
        center: {
          x: center.x - halfW + cellW / 2 + col * (cellW + gap),
          z: center.z - halfD + cellD / 2 + r * (cellD + gap),
        },
        halfW: cellW / 2,
        halfD: cellD / 2,
        ring,
      })
    }
  }
  return out
}

/**
 * Build the whole grid. Pure and deterministic: the same config always yields
 * an identical layout, which is what keeps the city stable across refreshes.
 */
let layoutCache: { layout: CityLayout; config: CityConfig } | null = null

/**
 * Memoised on the config object.
 *
 * It is a pure function of the config, and half a dozen builders now ask for
 * it — the plot planting, the ground cover, the parking, the built-block set.
 * Rebuilding the roads, sidewalks, intersections and twelve hundred parcels
 * once per caller is pure waste, and the callers cannot easily thread one
 * layout between them because most of them are reached from a block loop.
 */
export function buildCityLayout(c: CityConfig = cityConfig): CityLayout {
  if (layoutCache?.config === c) return layoutCache.layout
  const roads = buildRoads(c)
  const half = blockHalfExtent(c)

  const plots: Plot[] = []
  const r = c.grid.midRadius
  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      const ring = ringOf(block, c)
      if (!ring) continue
      plots.push(...plotsForBlock(block, ring, c))
    }
  }


  layoutCache = {
    config: c,
    layout: {
      roads,
      intersections: buildIntersections(c),
      sidewalks: buildSidewalks(roads, c),
      plots,
      plaza: { center: { x: 0, z: 0 }, halfW: half, halfD: half },
      groundRadius: c.groundRadius,
    },
  }
  return layoutCache.layout
}
