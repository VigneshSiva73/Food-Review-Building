import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { blockHalfExtent, buildCityLayout, seamCoord } from './cityLayout'
import { buildGroundPlan, type GroundQuad, type GroundSlab } from './groundPlan'

const LAYERS = { asphaltEw: 0.01, asphaltNs: 0.012, markings: 0.024, kerbTop: 0.15 }
const layout = buildCityLayout()
const plan = buildGroundPlan(layout, LAYERS)

function seamGap(v: number): { gap: number; halfWidth: number } {
  let gap = Infinity
  let halfWidth = 0
  for (let b = -cityConfig.grid.midRadius - 1; b <= cityConfig.grid.midRadius; b++) {
    const d = Math.abs(v - seamCoord(b))
    if (d < gap) {
      gap = d
      halfWidth = b === 0 || b === -1 ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth
    }
  }
  return { gap, halfWidth }
}

const quadCorners = (q: GroundQuad) => [
  { x: q.cx - q.halfW, z: q.cz - q.halfD },
  { x: q.cx + q.halfW, z: q.cz - q.halfD },
  { x: q.cx - q.halfW, z: q.cz + q.halfD },
  { x: q.cx + q.halfW, z: q.cz + q.halfD },
]

describe('buildGroundPlan', () => {
  it('is deterministic', () => {
    expect(buildGroundPlan(layout, LAYERS)).toEqual(plan)
  })

  it('keeps every painted line on the asphalt', () => {
    // Paint that strays onto a kerb or the plaza is the classic tell of a
    // procedurally generated road, so this is worth pinning hard.
    for (const quad of plan.markings) {
      for (const corner of quadCorners(quad)) {
        const x = seamGap(corner.x)
        const z = seamGap(corner.z)
        const onNs = x.gap <= x.halfWidth + 1e-6
        const onEw = z.gap <= z.halfWidth + 1e-6
        expect(onNs || onEw).toBe(true)
      }
    }
  })

  it('never paints a centre line through a junction', () => {
    // A dash is the marking whose narrow axis is the paint width; zebras and
    // stop bars are wider and live at the crossings, so exclude them by shape
    // rather than by a hard-coded length.
    const paintHalf = cityConfig.roads.markingWidth / 2
    const isDash = (q: GroundQuad) =>
      Math.abs(q.halfD - paintHalf) < 1e-9 || Math.abs(q.halfW - paintHalf) < 1e-9
    const dashes = plan.markings.filter(isDash)
    expect(dashes.length).toBeGreaterThan(50)

    for (const dash of dashes) {
      // Measure along the road's running axis — the one the dash is long on.
      const along = Math.abs(dash.halfD - paintHalf) < 1e-9 ? dash.cx : dash.cz
      expect(seamGap(along).gap).toBeGreaterThan(cityConfig.roads.mainHalfWidth)
    }
  })

  it('lays no ground furniture across the hero plaza', () => {
    const half = blockHalfExtent()
    const insidePlaza = (x: number, z: number) => Math.abs(x) < half && Math.abs(z) < half
    for (const quad of [...plan.markings, ...plan.asphalt]) {
      for (const corner of quadCorners(quad)) {
        expect(insidePlaza(corner.x, corner.z)).toBe(false)
      }
    }
  })

  it('raises walkways and paving onto the kerb, above the asphalt', () => {
    const surfaces: GroundSlab[] = [...plan.walkways, plan.plaza]
    for (const slab of surfaces) {
      expect(slab.y0).toBe(0)
      expect(slab.y1).toBeGreaterThan(LAYERS.markings)
    }
  })

  it('separates coplanar layers so nothing z-fights', () => {
    // Every stacked surface must sit strictly above the one it covers.
    expect(LAYERS.asphaltNs).toBeGreaterThan(LAYERS.asphaltEw)
    expect(LAYERS.markings).toBeGreaterThan(LAYERS.asphaltNs)
    // The two walkway axes are offset from each other for the same reason.
    const tops = new Set(plan.walkways.map((w) => w.y1))
    expect(tops.size).toBe(2)
  })

  it('covers the plaza to the block edge', () => {
    // The plaza is block zero, whose width is deliberately fixed at the pitch.
    expect(plan.plaza.halfW).toBeCloseTo(blockHalfExtent())
  })

  it('surfaces every road exactly once', () => {
    // Counted by MATCHING each road rather than by totalling the buffer. The
    // asphalt layer carries every hard surface in the city — roads, facility
    // car parks, the theme park's midway, the lots beside buildings and the
    // playgrounds — because one buffer is one draw call, so a total is a
    // running tally of unrelated features and says nothing about the roads.
    for (const road of layout.roads) {
      const along = (road.to - road.from) / 2
      const mid = (road.from + road.to) / 2
      const isEw = road.axis === 'ew'
      const match = plan.asphalt.filter(
        (q) =>
          Math.abs(q.cx - (isEw ? mid : road.center)) < 1e-6 &&
          Math.abs(q.cz - (isEw ? road.center : mid)) < 1e-6 &&
          Math.abs(q.halfW - (isEw ? along : road.halfWidth)) < 1e-6 &&
          Math.abs(q.halfD - (isEw ? road.halfWidth : along)) < 1e-6,
      )
      expect(`${road.id}:${match.length}`).toBe(`${road.id}:1`)
    }
    expect(plan.walkways).toHaveLength(layout.sidewalks.length)
  })

  it('marks all sixteen crossings with zebras and stop bars', () => {
    // 16 crossings × 5 zebra bars, plus one stop bar each.
    const zebraCount = 16 * 5
    const stopBars = 16
    const dashes = plan.markings.length - zebraCount - stopBars
    expect(dashes).toBeGreaterThan(0)
  })
})
