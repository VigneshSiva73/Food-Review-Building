import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { blockHalfExtent, buildCityLayout, districtReach, seamCoord } from './cityLayout'
import { buildStreetProps, faceRoadYaw } from './streetProps'
import type { PropKind, PropPlacement, TreePlacement, Vec2 } from './types'

const LEVELS = { kerbTop: 0.15 }
const layout = buildCityLayout()
const props = buildStreetProps(layout, 'high', LEVELS)

const streetTrees = props.trees
const kinds = (k: PropKind) => props.furniture.filter((p) => p.kind === k)

/** Distance from a point to the nearest asphalt edge, negative when on it. */
function clearanceFromAsphalt(v: number): number {
  let best = Infinity
  for (let b = -cityConfig.grid.midRadius - 1; b <= cityConfig.grid.midRadius; b++) {
    const half = b === 0 || b === -1 ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth
    best = Math.min(best, Math.abs(v - seamCoord(b)) - half)
  }
  return best
}

/**
 * True when a point is clear of every road surface.
 *
 * Both axes have to be clear, not either: the grid's roads run the full extent
 * in both directions, so falling inside any seam's asphalt band in x OR in z
 * already puts you on a carriageway.
 */
function onPaving(p: Vec2): boolean {
  return clearanceFromAsphalt(p.x) > 0 && clearanceFromAsphalt(p.z) > 0
}

/**
 * True when a point is inside a junction box — where two roads' reserves
 * overlap, which is where the crossings and stop bars are.
 *
 * Measured from the road reserve rather than from `props.junctionClearance`,
 * so this stays a real geometric assertion instead of restating whatever the
 * placement code happened to use.
 */
function inJunctionBox(p: Vec2): boolean {
  const reserve = cityConfig.roads.sidewalkWidth
  return clearanceFromAsphalt(p.x) <= reserve && clearanceFromAsphalt(p.z) <= reserve
}

describe('buildStreetProps', () => {
  it('is deterministic for a given layout and density', () => {
    const again = buildStreetProps(layout, 'high', LEVELS)
    expect(again.trees).toEqual(props.trees)
    expect(again.furniture).toEqual(props.furniture)
  })

  it('never plants anything on the asphalt', () => {
    // The whole reason placement is derived from the walkway strips rather
    // than from free coordinates. A tree in the middle of a lane is the most
    // obvious possible tell that the city is generated.
    for (const t of props.trees) expect(onPaving(t.position)).toBe(true)
    for (const p of props.furniture) expect(onPaving(p.position)).toBe(true)
  })

  it('keeps junctions clear so nothing stands in a crossing', () => {
    const street = [...streetTrees, ...kinds('lamp'), ...kinds('bench'), ...kinds('bin')]
    for (const p of street) expect(inJunctionBox(p.position)).toBe(false)
  })

  it('leaves the hero plaza itself unplanted', () => {
    // The tower's forecourt is its breathing room; only the bollards ringing
    // the edge belong there.
    const half = blockHalfExtent()
    const inside = (p: Vec2) => Math.abs(p.x) < half - 0.5 && Math.abs(p.z) < half - 0.5
    for (const t of props.trees) expect(inside(t.position)).toBe(false)
    for (const p of props.furniture) expect(inside(p.position)).toBe(false)
  })

  it('plants every street at one spacing, thinning only the geometry', () => {
    // Two goes at this were rejected: first side streets past the inner ring
    // were not planted at all, then they were planted at a longer stride and
    // still read as bare road. Every street now carries the same tree line as
    // the tower's own; what falls off with distance is the detail tier, which
    // is what keeps ten thousand trees inside the triangle budget.
    const inner = districtReach()
    const spacingOn = (walk: (typeof layout.sidewalks)[number]) => {
      const along = streetTrees
        .filter((t) => {
          const lateral = walk.axis === 'ew' ? t.position.z : t.position.x
          return Math.abs(lateral - walk.center + walk.side * cityConfig.props.kerbOffset) < 0.5
        })
        .map((t) => (walk.axis === 'ew' ? t.position.x : t.position.z))
        .sort((a, b) => a - b)
      if (along.length < 2) return Infinity
      const gaps = along.slice(1).map((v, i) => v - along[i])
      return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
    }

    const far = layout.sidewalks.filter(
      (w) => w.roadClass !== 'main' && Math.abs(w.center) > inner * 2,
    )
    expect(far.length).toBeGreaterThan(0)
    // Every far street is planted, not merely some of them.
    for (const walk of far) expect(spacingOn(walk)).toBeLessThan(Infinity)

    const near = layout.sidewalks.filter(
      (w) => w.roadClass !== 'main' && Math.abs(w.center) < inner,
    )
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    expect(median(far.map(spacingOn))).toBe(median(near.map(spacingOn)))

    // The saving comes from the geometry instead, and it has to be the far
    // trees that are cheapened — cheapening the ones by the tower is the one
    // place the difference would show.
    const detailAt = (t: TreePlacement) =>
      Math.max(Math.abs(t.position.x), Math.abs(t.position.z)) > inner ? 'far' : 'near'
    for (const t of streetTrees) expect(t.detail).toBe(detailAt(t))
    expect(streetTrees.filter((t) => t.detail === 'far').length).toBeGreaterThan(
      streetTrees.length * 0.5,
    )
  })

  it('puts seating and bins only on the avenues, within the inner ring', () => {
    const inner = districtReach()
    for (const p of [...kinds('bin'), ...kinds('bench')]) {
      expect(Math.abs(p.position.x)).toBeLessThanOrEqual(inner)
      expect(Math.abs(p.position.z)).toBeLessThanOrEqual(inner)
    }
  })

  it('stands every prop on the surface it sits on, never in mid-air', () => {
    for (const p of props.furniture) expect(p.baseY).toBe(LEVELS.kerbTop)
    for (const t of props.trees) expect(t.baseY).toBe(LEVELS.kerbTop)
  })

  it('keeps the walkway clear around each bus shelter', () => {
    const shelters = kinds('busStop')
    expect(shelters).toHaveLength(cityConfig.props.busStops)
    for (const s of shelters) {
      const near = [...streetTrees, ...kinds('lamp')].filter(
        (p) => Math.hypot(p.position.x - s.position.x, p.position.z - s.position.z) <= cityConfig.props.shelterClearance,
      )
      expect(near).toHaveLength(0)
    }
  })

  it('rings the plaza with bollards and nothing else', () => {
    const half = blockHalfExtent()
    for (const b of kinds('bollard')) {
      // Each bollard sits exactly on one plaza edge.
      const onEdge = Math.abs(Math.abs(b.position.x) - half) < 1e-9 || Math.abs(Math.abs(b.position.z) - half) < 1e-9
      expect(onEdge).toBe(true)
      expect(Math.max(Math.abs(b.position.x), Math.abs(b.position.z))).toBeCloseTo(half)
    }
  })

  it('thins the whole city as density drops, not just its outskirts', () => {
    // Slicing a distance-sorted list would leave a hard circular edge where
    // the planting stopped; widening the spacing has to thin everywhere.
    const low = buildStreetProps(layout, 'low', LEVELS)
    const reach = (list: TreePlacement[] | PropPlacement[]) =>
      Math.max(...list.map((p) => Math.hypot(p.position.x, p.position.z)))

    expect(low.trees.length).toBeLessThan(props.trees.length * 0.6)
    // Still reaching just as far out, only sparser along the way.
    expect(reach(low.trees)).toBeGreaterThan(reach(props.trees) * 0.9)
  })

  it('gives trees varied heights and canopies rather than one stamp', () => {
    const heights = new Set(streetTrees.slice(0, 50).map((t) => t.height.toFixed(3)))
    expect(heights.size).toBeGreaterThan(40)
    const { min, max } = cityConfig.props.tree.height
    for (const t of props.trees) {
      expect(t.height).toBeGreaterThanOrEqual(min)
      expect(t.height).toBeLessThanOrEqual(max)
    }
  })
})

describe('faceRoadYaw', () => {
  it('turns a +Z-facing prop toward the road beside it', () => {
    // Rotating +Z by θ about Y gives (sin θ, cos θ); the road lies at -side.
    const facing = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) })
    expect(facing(faceRoadYaw('ew', 1)).z).toBeCloseTo(-1)
    expect(facing(faceRoadYaw('ew', -1)).z).toBeCloseTo(1)
    expect(facing(faceRoadYaw('ns', 1)).x).toBeCloseTo(-1)
    expect(facing(faceRoadYaw('ns', -1)).x).toBeCloseTo(1)
  })

  it('faces every kerb-side prop across its own road', () => {
    for (const p of kinds('lamp')) {
      const dir = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) }
      // Step off the kerb in the facing direction: it has to land on asphalt,
      // measured across the axis actually being crossed. A lamp turned the
      // wrong way would cantilever its arm over the building line instead.
      const step = cityConfig.roads.sidewalkWidth
      const crossing = Math.abs(dir.z) > 0.5 ? p.position.z + dir.z * step : p.position.x + dir.x * step
      expect(clearanceFromAsphalt(crossing)).toBeLessThan(0)
    }
  })
})
