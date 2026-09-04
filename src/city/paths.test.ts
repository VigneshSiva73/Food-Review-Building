import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { blockHalfExtent, blockSpan, seamCoord } from './cityLayout'
import {
  buildCityPaths,
  buildCrossings,
  buildPedestrianRoutes,
  buildSignals,
  buildVehicleRoutes,
  makeRoute,
  poseAt,
  signalCycleMs,
  signalStateAt,
} from './paths'

const paths = buildCityPaths()
/**
 * Where the avenues flanking the hero's block run.
 *
 * Half the plaza's own span, not half the grid pitch: the plaza is sized to
 * the building and is now two pitches wide, so those are different numbers.
 */
const plazaEdge = blockSpan(0) / 2


/** Smallest distance from a coordinate to any road centreline. */
function seamGap(v: number): { gap: number; main: boolean } {
  let gap = Infinity
  let main = false
  for (let b = -cityConfig.grid.midRadius - 1; b <= cityConfig.grid.midRadius; b++) {
    const d = Math.abs(v - seamCoord(b))
    if (d < gap) {
      gap = d
      main = b === 0 || b === -1
    }
  }
  return { gap, main }
}

describe('poseAt', () => {
  const square = makeRoute('unit', [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ])

  it('measures the closed loop including the leg back to the start', () => {
    expect(square.length).toBeCloseTo(40)
  })

  it('walks the loop and returns to the start after a full lap', () => {
    expect(poseAt(square, 0).position).toEqual({ x: 0, z: 0 })
    expect(poseAt(square, 5).position.x).toBeCloseTo(5)
    expect(poseAt(square, 15).position).toMatchObject({ x: 10 })
    expect(poseAt(square, square.length).position.x).toBeCloseTo(0)
  })

  it('wraps in both directions so callers never manage the odometer', () => {
    // Vehicles just accumulate speed × delta forever; this is what makes that safe.
    const a = poseAt(square, 7)
    const b = poseAt(square, 7 + square.length * 3)
    const c = poseAt(square, 7 - square.length * 2)
    expect(b.position.x).toBeCloseTo(a.position.x)
    expect(b.position.z).toBeCloseTo(a.position.z)
    expect(c.position.x).toBeCloseTo(a.position.x)
  })

  it('faces along the direction of travel', () => {
    // Heading is atan2(dx, dz): moving along +x is a quarter turn from +z.
    expect(poseAt(square, 5).heading).toBeCloseTo(Math.PI / 2)
  })
})

describe('buildVehicleRoutes', () => {
  const routes = buildVehicleRoutes()

  it('is deterministic', () => {
    expect(buildVehicleRoutes()).toEqual(routes)
  })

  it('keeps every vehicle on asphalt for the whole loop', () => {
    // Sampled densely rather than at vertices, so a corner arc that swings
    // wide of the kerb is caught.
    for (const route of routes) {
      for (let i = 0; i < 400; i++) {
        const { position } = poseAt(route, (route.length * i) / 400)
        const x = seamGap(position.x)
        const z = seamGap(position.z)
        const onNs = x.gap <= (x.main ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth) + 1e-9
        const onEw = z.gap <= (z.main ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth) + 1e-9
        expect(onNs || onEw).toBe(true)
      }
    }
  })

  it('never drives across the hero plaza', () => {
    const half = blockHalfExtent()
    for (const route of routes) {
      for (let i = 0; i < 400; i++) {
        const { position } = poseAt(route, (route.length * i) / 400)
        const insidePlaza = Math.abs(position.x) < half && Math.abs(position.z) < half
        expect(insidePlaza).toBe(false)
      }
    }
  })

  it('runs opposing lanes either side of each centreline', () => {
    const { laneOffset } = cityConfig.roads
    for (let b = 0; b <= cityConfig.grid.midRadius; b++) {
      const outer = routes.find((r) => r.id === `veh-${b}-out`)!
      const inner = routes.find((r) => r.id === `veh-${b}-in`)!
      // Checked per SIDE. Taking the largest absolute x assumed the ring was
      // symmetric about the origin, which stopped being true once block widths
      // began to vary: the seam at -b-1 is not minus the seam at b, so the
      // widest point of a loop can be its negative side.
      const maxX = (r: typeof outer) => Math.max(...r.points.map((p) => p.x))
      const minX = (r: typeof outer) => Math.min(...r.points.map((p) => p.x))
      const hi = seamCoord(b)
      const lo = seamCoord(-b - 1)
      expect(maxX(outer)).toBeCloseTo(hi + laneOffset)
      expect(minX(outer)).toBeCloseTo(lo - laneOffset)
      expect(maxX(inner)).toBeCloseTo(hi - laneOffset)
      expect(minX(inner)).toBeCloseTo(lo + laneOffset)
    }
  })

  it('sends the two lanes of a seam in opposite directions', () => {
    // Signed area of the polygon: opposite signs mean opposite winding.
    const signedArea = (pts: { x: number; z: number }[]) =>
      pts.reduce((sum, p, i) => {
        const q = pts[(i + 1) % pts.length]
        return sum + (p.x * q.z - q.x * p.z)
      }, 0)
    const outer = routes.find((r) => r.id === 'veh-0-out')!
    const inner = routes.find((r) => r.id === 'veh-0-in')!
    expect(Math.sign(signedArea(outer.points))).toBe(-Math.sign(signedArea(inner.points)))
  })
})

describe('buildPedestrianRoutes', () => {
  it('keeps every pedestrian off the asphalt', () => {
    // Both axes have to be clear, not either. The earlier version of this test
    // accepted a point if one coordinate lay on a walkway, which is true in
    // the dead centre of a crossroads — and it duly passed while the routes
    // walked straight over every side street they crossed.
    const { sidewalkWidth } = cityConfig.roads
    const halfAt = (v: number) => {
      const { main } = seamGap(v)
      return main ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth
    }
    for (const route of buildPedestrianRoutes()) {
      for (let i = 0; i < 300; i++) {
        const { position } = poseAt(route, (route.length * i) / 300)
        for (const v of [position.x, position.z]) {
          expect(seamGap(v).gap).toBeGreaterThanOrEqual(halfAt(v) - 1e-9)
        }
        // And at least one axis is actually on a walkway, not out in a block.
        const onWalk = ([position.x, position.z] as const).some((v) => {
          const gap = seamGap(v).gap
          return gap >= halfAt(v) - 1e-9 && gap <= halfAt(v) + sidewalkWidth + 1e-9
        })
        expect(onWalk).toBe(true)
      }
    }
  })
})

describe('signals', () => {
  const signals = buildSignals()

  it('covers the whole cycle with exactly one state at a time', () => {
    const cycle = signalCycleMs()
    const phase = signals[0]
    const seen = new Set<string>()
    for (let t = 0; t < cycle; t += 100) seen.add(signalStateAt(t, phase))
    expect(seen).toEqual(new Set(['green', 'yellow', 'red']))
    // Wraps cleanly, so a long-running page never falls off the end.
    expect(signalStateAt(cycle * 7 + 10, phase)).toBe(signalStateAt(10, phase))
    expect(signalStateAt(-10, phase)).toBe(signalStateAt(cycle - 10, phase))
  })

  it('never gives crossing streams green at the same moment', () => {
    // Adjacent corners are half a cycle apart, so a junction never shows two
    // conflicting greens — the thing that would read as broken to any viewer.
    const a = signals.find((s) => s.id === 'signal-0-0')!
    const b = signals.find((s) => s.id === 'signal-0--1')!
    expect(a.offsetMs).not.toBe(b.offsetMs)
    for (let t = 0; t < signalCycleMs(); t += 100) {
      const both = signalStateAt(t, a) === 'green' && signalStateAt(t, b) === 'green'
      expect(both).toBe(false)
    }
  })

  it('places one signal at each corner of the hero block', () => {
    expect(signals).toHaveLength(4)
    for (const s of signals) {
      expect(Math.abs(s.center.x)).toBeCloseTo(plazaEdge)
      expect(Math.abs(s.center.z)).toBeCloseTo(plazaEdge)
    }
  })
})

describe('crossings', () => {
  it('sits on the road, just clear of each signalled junction', () => {
    const crossings = buildCrossings()
    expect(crossings).toHaveLength(16)
    for (const c of crossings) {
      const along = c.axis === 'ew' ? c.center.z : c.center.x
      expect(Math.abs(along)).toBeCloseTo(plazaEdge)
      const across = c.axis === 'ew' ? c.center.x : c.center.z
      const offset = Math.abs(Math.abs(across) - plazaEdge)
      expect(offset).toBeCloseTo(cityConfig.roads.mainHalfWidth + c.depth / 2)
    }
  })
})

describe('buildCityPaths', () => {
  it('bundles every movement system and stays deterministic', () => {
    expect(buildCityPaths()).toEqual(paths)
    expect(paths.vehicleRoutes.length).toBeGreaterThan(0)
    expect(paths.pedestrianRoutes.length).toBeGreaterThan(0)
    expect(paths.crossings.length).toBeGreaterThan(0)
    expect(paths.signals).toHaveLength(4)
    for (const route of [...paths.vehicleRoutes, ...paths.pedestrianRoutes]) {
      expect(route.length).toBeGreaterThan(0)
      expect(route.cumulative).toHaveLength(route.points.length)
    }
  })
})
