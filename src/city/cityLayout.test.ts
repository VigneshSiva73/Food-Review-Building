import { describe, expect, it } from 'vitest'
import { cityConfig, roadReserve } from '@/config'
import { blockHalfExtent, blockRing, blockSpan, buildCityLayout, seamCoord } from './cityLayout'
import type { Plot } from './types'

const layout = buildCityLayout()
/**
 * Where the avenues flanking the hero's block run.
 *
 * Half the plaza's own span, not half the grid pitch: the plaza is sized to
 * the building and is now two pitches wide, so those are different numbers.
 */
const plazaEdge = blockSpan(0) / 2


/** Distance from a coordinate to the nearest road centreline on that axis. */
function distanceToNearestSeam(v: number): number {
  let best = Infinity
  for (let b = -cityConfig.grid.midRadius - 1; b <= cityConfig.grid.midRadius; b++) {
    best = Math.min(best, Math.abs(v - seamCoord(b)))
  }
  return best
}

/** The four corner points of a plot's buildable rectangle. */
function plotCorners(p: Plot) {
  return [
    { x: p.center.x - p.halfW, z: p.center.z - p.halfD },
    { x: p.center.x + p.halfW, z: p.center.z - p.halfD },
    { x: p.center.x - p.halfW, z: p.center.z + p.halfD },
    { x: p.center.x + p.halfW, z: p.center.z + p.halfD },
  ]
}

describe('buildCityLayout', () => {
  it('is deterministic — the same config always yields an identical city', () => {
    // The whole point of seeding: a refresh must not reshuffle the district.
    expect(buildCityLayout()).toEqual(buildCityLayout())
  })

  it('leaves the hero block entirely unbuilt', () => {
    // The plaza is the building's breathing room; a plot here would put a
    // neighbour inside the tower's forecourt.
    const half = blockHalfExtent()
    for (const plot of layout.plots) {
      expect(blockRing(plot.block)).toBeGreaterThan(0)
      for (const corner of plotCorners(plot)) {
        const insidePlaza = Math.abs(corner.x) < half && Math.abs(corner.z) < half
        expect(insidePlaza).toBe(false)
      }
    }
  })

  it('keeps the nearest buildable ground clear of the tower by a wide margin', () => {
    const nearest = Math.min(
      ...layout.plots.flatMap((p) => plotCorners(p).map((c) => Math.hypot(c.x, c.z))),
    )
    // Roughly a hero footprint and a half of clear plaza in every direction.
    expect(nearest).toBeGreaterThan(100)
  })

  it('never places a plot on asphalt or sidewalk', () => {
    // Plots are derived from the same seams the roads are, so this is a
    // structural guarantee — pinning it catches any future widening that
    // forgets to re-derive the block interior.
    const reserve = roadReserve(true)
    for (const plot of layout.plots) {
      for (const corner of plotCorners(plot)) {
        expect(distanceToNearestSeam(corner.x)).toBeGreaterThanOrEqual(reserve - 1e-9)
        expect(distanceToNearestSeam(corner.z)).toBeGreaterThanOrEqual(reserve - 1e-9)
      }
    }
  })

  it('runs main avenues along the hero block and secondary streets elsewhere', () => {
    const mains = layout.roads.filter((r) => r.roadClass === 'main')
    // Two seams border the hero block on each axis: b = -1 and b = 0.
    expect(mains).toHaveLength(4)
    for (const road of mains) {
      expect(Math.abs(road.center)).toBeCloseTo(plazaEdge)
      expect(road.halfWidth).toBe(cityConfig.roads.mainHalfWidth)
    }
  })

  it('pairs every road with a sidewalk on each side, clear of the asphalt', () => {
    expect(layout.sidewalks).toHaveLength(layout.roads.length * 2)
    for (const road of layout.roads) {
      // Matched on geometry rather than on the id. `id.includes` looked fine
      // until the grid grew past ten blocks, at which point "road-ew-1" is a
      // substring of "road-ew-10" and a road picked up its neighbour's kerbs.
      const walks = layout.sidewalks.filter(
        (w) => w.axis === road.axis && w.roadCenter === road.center,
      )
      expect(walks).toHaveLength(2)
      for (const walk of walks) {
        const gap = Math.abs(walk.center - road.center) - walk.width / 2
        expect(gap).toBeCloseTo(road.halfWidth)
      }
    }
  })

  it('signals exactly the four junctions around the hero block', () => {
    const signalled = layout.intersections.filter((i) => i.signalled)
    expect(signalled).toHaveLength(4)
    for (const junction of signalled) {
      expect(Math.abs(junction.center.x)).toBeCloseTo(plazaEdge)
      expect(Math.abs(junction.center.z)).toBeCloseTo(plazaEdge)
    }
  })

  it('classifies plots into the configured rings', () => {
    for (const plot of layout.plots) {
      const ring = blockRing(plot.block)
      const expected = ring <= cityConfig.grid.innerRadius ? 'inner' : 'mid'
      expect(plot.ring).toBe(expected)
      expect(ring).toBeLessThanOrEqual(cityConfig.grid.midRadius)
    }
    expect(layout.plots.some((p) => p.ring === 'inner')).toBe(true)
    expect(layout.plots.some((p) => p.ring === 'mid')).toBe(true)
  })

  it('fits the whole district inside the ground disc', () => {
    for (const plot of layout.plots) {
      for (const corner of plotCorners(plot)) {
        expect(Math.hypot(corner.x, corner.z)).toBeLessThan(layout.groundRadius)
      }
    }
  })

  it('gives every plot a unique id', () => {
    const ids = new Set(layout.plots.map((p) => p.id))
    expect(ids.size).toBe(layout.plots.length)
  })
})
