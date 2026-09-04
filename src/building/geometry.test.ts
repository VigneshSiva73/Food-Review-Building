import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildingConfig, materialsConfig, slabOverhang } from '@/config'
import { runPipeline } from '@/data/pipeline'
import type { DailyReview, MealType, Vec3 } from '@/types'
import { weekdayOfISO } from '@/utils/date'
import { solveFloor } from './floorSolver'
import { buildLayout } from './layoutSolver'
import { buildDeckInstances, buildPillarInstances } from './matrices'
import {
  buildSlabGeometry,
  plateOutline,
  inflateSlab,
  roundCorners,
  slabOutlineLength,
  slabVertsPerFloor,
} from './slabGeometry'
import { applyExplode } from './explode'
import { slabSoffitY, slabTopY } from './facade'

function makeDay(date: string, ratings: Partial<Record<MealType, number>>): DailyReview {
  const weekday = weekdayOfISO(date)
  const day: DailyReview = { date, weekday, isSaturday: weekday === 6, meals: {} }
  for (const [meal, rating] of Object.entries(ratings)) {
    day.meals[meal as MealType] = {
      date,
      mealType: meal as MealType,
      rating,
      vendor: meal === 'Lunch' ? 'Smith' : 'John',
    }
  }
  return day
}

const weekdayFloor = solveFloor(makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }), 0, 0)
const saturdayFloor = solveFloor(makeDay('2026-06-06', { Breakfast: 2, Lunch: 4 }), 1, 20)

describe('buildPillarInstances', () => {
  it('splits data pillars and supports with the right widths and heights', () => {
    const { data, support } = buildPillarInstances([weekdayFloor, saturdayFloor])
    expect(data).toHaveLength(5)
    expect(support).toHaveLength(1)
    // Widths carry the bounded per-floor variation (±variationAmplitude).
    const amp = buildingConfig.variationAmplitude
    for (const p of data) {
      expect(p.transform.scale.x).toBeGreaterThanOrEqual(buildingConfig.pillarWidth * (1 - amp))
      expect(p.transform.scale.x).toBeLessThanOrEqual(buildingConfig.pillarWidth * (1 + amp))
    }
    // Support posts carry the same bounded per-floor variation as the pillars.
    expect(support[0].transform.scale.x).toBeGreaterThanOrEqual(
      buildingConfig.supportWidth * (1 - amp),
    )
    expect(support[0].transform.scale.x).toBeLessThanOrEqual(
      buildingConfig.supportWidth * (1 + amp),
    )
    expect(support[0].meta).toMatchObject({ mealType: 'Dinner', isData: false, floorIndex: 1 })
    // Scale.y carries the rating-driven height.
    expect(data[1].transform.scale.y).toBeCloseTo(buildingConfig.pillarHeightMax) // rating 5
  })
})

describe('buildDeckInstances', () => {
  it('creates three beams and three nodes per floor at deck mid-height', () => {
    const deck = buildDeckInstances([weekdayFloor])
    expect(deck.beams).toHaveLength(3)
    expect(deck.nodes).toHaveLength(3)
    const midY = weekdayFloor.baseY + buildingConfig.deckThickness / 2
    expect(deck.beams.every((b) => b.position.y === midY)).toBe(true)
  })

  it('sizes each beam to span exactly between its two corners', () => {
    const deck = buildDeckInstances([weekdayFloor])
    const corners = weekdayFloor.pillars.map((p) => p.base)
    deck.beams.forEach((beam, i) => {
      const a = corners[i]
      const b = corners[(i + 1) % 3]
      expect(beam.scale.z).toBeCloseTo(Math.hypot(b.x - a.x, b.z - a.z))
      expect(beam.position.x).toBeCloseTo((a.x + b.x) / 2)
      expect(beam.position.z).toBeCloseTo((a.z + b.z) / 2)
    })
  })
})

describe('buildSlabGeometry', () => {
  const data = buildSlabGeometry([weekdayFloor, saturdayFloor])
  const VERTS_PER_SLAB = slabVertsPerFloor()

  it('emits a uniform vertex count per slab with a per-vertex floorIndex', () => {
    // The exact number matters far less than its being identical on every
    // floor: the day slider reveals by draw range and picking resolves a face
    // to its floor by index, and both break the moment one plate differs.
    expect(VERTS_PER_SLAB).toBe(slabOutlineLength() * 12)
    expect(data.positions.length).toBe(2 * VERTS_PER_SLAB * 3)
    expect(data.floorIndex.length).toBe(2 * VERTS_PER_SLAB)
    expect(new Set(data.floorIndex.slice(0, VERTS_PER_SLAB))).toEqual(new Set([0]))
    expect(new Set(data.floorIndex.slice(VERTS_PER_SLAB))).toEqual(new Set([1]))
  })

  it('carries texture coordinates and baked shade on every vertex', () => {
    expect(data.uv.length).toBe(2 * VERTS_PER_SLAB * 2)
    expect(data.shade.length).toBe(2 * VERTS_PER_SLAB * 3)
  })

  it('bakes the soffit darker than the top, and the edge in between', () => {
    // This is the app's ambient occlusion. There is no postprocessing pass and
    // the shadow map is frozen after one render, so if the underside of a
    // plate is not dark in the geometry it is not dark at all.
    //
    // Read from the geometry rather than from the emission order: the fans
    // interleave bottom and top triangles, so an index-based split would
    // silently start measuring the wrong vertices if that order ever changed.
    //
    // Against the SLAB'S OWN PLANE, not against an absolute height. A single
    // y threshold worked only while the plate was near enough level; the
    // pillars are tall enough now that the tilt across one plate exceeds its
    // thickness, so the soffit at the high corner sits above the top face at
    // the low one and any horizontal cut mixes the two faces together.
    const n = slabOutlineLength()
    const toneAt = (i: number) => data.shade[i * 3]
    const at = (i: number) => ({
      x: data.positions[i * 3],
      y: data.positions[i * 3 + 1],
      z: data.positions[i * 3 + 2],
    })
    const fanEnd = n * 6

    const soffit: number[] = []
    const top: number[] = []
    for (let i = 0; i < fanEnd; i++) {
      const p = at(i)
      const underside = slabSoffitY(p.x, p.z, weekdayFloor.slab)
      const upperside = slabTopY(p.x, p.z, weekdayFloor.slab)
      ;(Math.abs(p.y - upperside) < Math.abs(p.y - underside) ? top : soffit).push(toneAt(i))
    }
    const wall = Array.from({ length: VERTS_PER_SLAB - fanEnd }, (_, k) => toneAt(fanEnd + k))

    expect(soffit.length).toBeGreaterThan(0)
    expect(Math.max(...soffit)).toBeLessThan(Math.min(...top))
    expect(Math.max(...soffit)).toBeLessThan(Math.min(...wall))
    expect(Math.max(...wall)).toBeLessThanOrEqual(Math.min(...top))
  })

  it('rounds the plan corners, so the tower has no knife edges', () => {
    // The three vertical arrises of the building are the plate corners
    // stacked. On a bare triangle they are razor sharp; every corner is now a
    // 120° arc wrapped round the column that stands there.
    expect(slabOutlineLength()).toBe(3 * (buildingConfig.plateCornerSegments + 1))
    const outline = plateOutline(
      weekdayFloor.slab.corners,
      slabOverhang(),
      buildingConfig.plateCornerSegments,
    )
    // Every arc point is exactly `slabOverhang` from the column it wraps —
    // that is what makes the corner a circle rather than a cut-off triangle.
    for (const corner of weekdayFloor.slab.corners) {
      const wrapping = outline.filter(
        (p) => Math.hypot(p.x - corner.x, p.y - corner.y, p.z - corner.z) < slabOverhang() + 1e-6,
      )
      expect(wrapping).toHaveLength(buildingConfig.plateCornerSegments + 1)
      for (const p of wrapping) {
        expect(Math.hypot(p.x - corner.x, p.y - corner.y, p.z - corner.z)).toBeCloseTo(
          slabOverhang(),
          9,
        )
      }
    }
  })

  it('keeps the rounded outline exactly in the slab plane', () => {
    // An arc computed with a 3D circle would drift off the tilted plane by
    // whatever the arithmetic lost, and "every vertex lies on the soffit" is a
    // contract the wedge depends on. Slerping the two in-plane edge normals
    // cannot drift: every output is a weighted sum of vectors in the plane.
    const { normal: nrm, corners: cs } = weekdayFloor.slab
    for (const p of plateOutline(cs, slabOverhang(), 5)) {
      const d = (p.x - cs[0].x) * nrm.x + (p.y - cs[0].y) * nrm.y + (p.z - cs[0].z) * nrm.z
      expect(Math.abs(d)).toBeLessThan(1e-9)
    }
  })

  it('never lets a fillet swallow its neighbour on a short edge', () => {
    const tiny: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
    ]
    // Radius far larger than the edges; the clamp must keep the shape convex
    // and non-self-intersecting rather than producing a tangle.
    const out = roundCorners(tiny, 99, 3)
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9)
      expect(p.z).toBeGreaterThanOrEqual(-1e-9)
      expect(p.x + p.z).toBeLessThanOrEqual(3 + 1e-9)
    }
  })

  it('maps the concrete in world units, so grain never depends on plate size', () => {
    // Horizontal faces map straight off the plan. Normalised UVs would rescale
    // the grain with the plate, making a wide floor look smooth and a narrow
    // one coarse — the texel density has to be a property of the world, not of
    // the triangle.
    const tile = materialsConfig.heroConcrete.tileWorldSize
    for (let slab = 0; slab < 2; slab++) {
      for (let k = 0; k < 6; k++) {
        const i = slab * VERTS_PER_SLAB + k
        expect(data.uv[i * 2]).toBeCloseTo(data.positions[i * 3] / tile, 6)
        expect(data.uv[i * 2 + 1]).toBeCloseTo(data.positions[i * 3 + 2] / tile, 6)
      }
    }
  })

  it('keeps the edge grain still when floors are separated', () => {
    // Wall coordinates measure height from the floor's own datum, not from
    // world zero. Using world Y would slide the texture up the slab edge for
    // the whole explode animation, on every floor, by a different amount.
    const layout = buildLayout([
      makeDay('2026-06-04', { Breakfast: 4, Lunch: 2, Dinner: 5 }),
      makeDay('2026-06-05', { Breakfast: 2, Lunch: 5, Dinner: 3 }),
    ])
    const plain = buildSlabGeometry(layout.floors)
    const exploded = buildSlabGeometry(applyExplode(layout, 40).floors)
    for (let k = 0; k < plain.uv.length; k++) {
      expect(`uv${k}:${exploded.uv[k].toFixed(6)}`).toBe(`uv${k}:${plain.uv[k].toFixed(6)}`)
    }
  })

  it('spans the tilted soffit up to a flat top at the module ceiling', () => {
    // The plate is a wedge: the underside is the tilted plane through the
    // pillar tops (that tilt is the data), the top face is flat and level
    // with the module ceiling so the next day's columns land on it. Pinning
    // this shape matters — a top face parallel to the soffit left an open
    // void above every slab that grew as ratings fell.
    const { corners, normal } = weekdayFloor.slab
    const origin = corners[0]
    const topY = weekdayFloor.deckY
    // Absolute, and scaled to the tower: a plane distance accumulated from
    // coordinates twenty units up carries more rounding than one taken near
    // the origin, and 1e-6 started failing purely on that when the pillars
    // grew. The shape being pinned here is exact to far coarser than this.
    const ON_PLANE = 1e-4
    for (let i = 0; i < VERTS_PER_SLAB; i++) {
      const p: Vec3 = {
        x: data.positions[i * 3],
        y: data.positions[i * 3 + 1],
        z: data.positions[i * 3 + 2],
      }
      const dist =
        (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y + (p.z - origin.z) * normal.z
      // Nothing dips below the soffit.
      expect(dist).toBeGreaterThanOrEqual(-ON_PLANE)
      // Every vertex lies on the tilted soffit or on the flat top face.
      const onSoffit = Math.abs(dist) < ON_PLANE
      const onTop = Math.abs(p.y - topY) < ON_PLANE
      expect(onSoffit || onTop).toBe(true)
    }
  })

  it('passes the underside through the pillar-top contact points', () => {
    // The un-extended corners must lie on the bottom-face plane; with the
    // overhang applied the extended corner is corner + in-plane direction, so
    // corner itself is a convex combination of bottom vertices — verify the
    // contact by plane distance instead of vertex identity.
    const { corners, normal } = weekdayFloor.slab
    const b0: Vec3 = { x: data.positions[0], y: data.positions[1], z: data.positions[2] }
    for (const c of corners) {
      const dist =
        (c.x - b0.x) * normal.x + (c.y - b0.y) * normal.y + (c.z - b0.z) * normal.z
      expect(Math.abs(dist)).toBeLessThan(1e-6)
    }
  })
})

describe('full-building instance counts (real dataset)', () => {
  const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
  const layout = buildLayout(runPipeline(csvText).days)

  it('matches the expected totals for the whole dataset', () => {
    const pillars = buildPillarInstances(layout.floors)
    const deck = buildDeckInstances(layout.floors)
    const slabs = buildSlabGeometry(layout.floors)

    // Derived from the layout rather than typed in, so extending the dataset's
    // date range does not turn a real regression into an arithmetic edit.
    const floors = layout.floors.length
    const saturdays = layout.floors.filter((f) => f.availableMeals.length === 2).length
    expect(floors).toBe(497)
    expect(saturdays).toBe(66)

    expect(pillars.data).toHaveLength((floors - saturdays) * 3 + saturdays * 2)
    expect(pillars.support).toHaveLength(saturdays) // one per Saturday
    expect(deck.beams).toHaveLength(floors * 3)
    expect(deck.nodes).toHaveLength(floors * 3)
    expect(slabs.positions.length).toBe(floors * slabVertsPerFloor() * 3)
  })

  it('keeps every instance inside the building bounds', () => {
    const pillars = buildPillarInstances(layout.floors)
    for (const p of [...pillars.data, ...pillars.support]) {
      expect(Math.hypot(p.transform.position.x, p.transform.position.z)).toBeLessThanOrEqual(
        layout.radius,
      )
      const top = p.transform.position.y + p.transform.scale.y
      expect(top).toBeLessThanOrEqual(layout.totalHeight)
    }
  })
})

describe('inflateSlab (selection highlight shell)', () => {
  const centroidY = (f: typeof weekdayFloor) =>
    f.slab.corners.reduce((sum, c) => sum + c.y, 0) / 3

  it('grows the slab without moving it off its floor', () => {
    const d = 0.08
    const shell = inflateSlab(weekdayFloor, d)
    // Vertical shift is a small constant, never a fraction of the elevation.
    expect(Math.abs(centroidY(shell) - centroidY(weekdayFloor))).toBeLessThanOrEqual(d + 1e-9)
    expect(shell.slab.thickness).toBeCloseTo(weekdayFloor.slab.thickness + 2 * d)
    expect(shell.slab.normal).toEqual(weekdayFloor.slab.normal)
    expect(shell.floorIndex).toBe(weekdayFloor.floorIndex)
  })

  it('shifts a floor 400 units up by the same amount as one at ground level', () => {
    // The old bug scaled world coordinates about the origin, so the offset grew
    // with height and the highlight landed on a completely different floor.
    const d = 0.08
    const high = solveFloor(
      makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }),
      60,
      462,
    )
    const lowShift = Math.abs(centroidY(inflateSlab(weekdayFloor, d)) - centroidY(weekdayFloor))
    const highShift = Math.abs(centroidY(inflateSlab(high, d)) - centroidY(high))
    expect(highShift).toBeCloseTo(lowShift, 6)
    expect(highShift).toBeLessThan(0.5)
  })

  it('encloses the original slab on every side', () => {
    const d = 0.08
    const shell = inflateSlab(weekdayFloor, d)
    const centroid = (pts: { x: number; z: number }[]) => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
    })
    const c0 = centroid(weekdayFloor.slab.corners)
    shell.slab.corners.forEach((p, i) => {
      const original = weekdayFloor.slab.corners[i]
      // Each corner moves outward from the centroid, never inward.
      expect(Math.hypot(p.x - c0.x, p.z - c0.z)).toBeGreaterThan(
        Math.hypot(original.x - c0.x, original.z - c0.z),
      )
    })
  })
})

describe('plate coverage of the columns', () => {
  /** True when a plan point lies inside a closed polygon (ray cast). */
  function insidePlan(poly: Vec3[], x: number, z: number): boolean {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      if (
        a.z > z !== b.z > z &&
        x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
      ) {
        inside = !inside
      }
    }
    return inside
  }

  /** Shortest plan distance from a point to the outline polygon. */
  function edgeDistance(poly: Vec3[], x: number, z: number): number {
    let best = Infinity
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)))
    }
    return best
  }

  it('leaves a real reveal, not a hairline pass', () => {
    // Containment alone is too weak to keep the derivation honest: with a
    // generous reveal, dropping any single term still lands inside the plate
    // by a whisker. This asserts the column corner sits a usable distance in
    // from the edge, which is what "the plate carries the column" looks like.
    const layout = buildLayout([
      makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }),
      makeDay('2026-06-05', { Breakfast: 5, Lunch: 1, Dinner: 4 }),
    ])
    let worst = Infinity
    for (const floor of layout.floors) {
      const outline = plateOutline(
        floor.slab.corners,
        slabOverhang(),
        buildingConfig.plateCornerSegments,
      )
      for (const pillar of floor.pillars) {
        const half = (buildingConfig.pillarWidth / 2) * (1 + buildingConfig.variationAmplitude)
        for (let step = 0; step < 16; step++) {
          const angle = (step / 16) * Math.PI * 2
          worst = Math.min(
            worst,
            edgeDistance(
              outline,
              pillar.base.x + Math.cos(angle) * half,
              pillar.base.z + Math.sin(angle) * half,
            ),
          )
        }
      }
    }
    // Snug on purpose: the columns are meant to read as being AT the edge.
    expect(worst).toBeGreaterThan(0.1)
  })

  it('covers every column top, corner arcs included', () => {
    // The plate has to land on the columns it is carried by. This broke the
    // first time the corners were rounded: the plate overhung the column
    // centres by 0.7 and the fillet cut about two units back along the corner
    // bisector, so the plate stopped short and every column stood proud of the
    // slab it was supposed to be holding up. The plate now wraps each column
    // on an arc, so the guard is simply that the radius clears the column's
    // half-diagonal — pinned here rather than left to a screenshot.
    const layout = buildLayout([
      makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }),
      makeDay('2026-06-05', { Breakfast: 5, Lunch: 1, Dinner: 4 }),
      makeDay('2026-06-06', { Breakfast: 2, Lunch: 4 }),
    ])

    for (const floor of layout.floors) {
      const outline = plateOutline(
        floor.slab.corners,
        slabOverhang(),
        buildingConfig.plateCornerSegments,
      )
      for (const pillar of floor.pillars) {
        const half =
          ((pillar.isData ? buildingConfig.pillarWidth : buildingConfig.supportWidth) / 2) *
          (1 + buildingConfig.variationAmplitude)
        // The whole rim of the column's circular section, not just its axis:
        // a plate that reaches the centreline and not the wall still leaves
        // the column hanging over the edge. Round columns are why this can be
        // swept — a square one only had to be checked at its four corners,
        // but they reached a factor of √2 further than its faces.
        for (let step = 0; step < 16; step++) {
          const angle = (step / 16) * Math.PI * 2
          const x = pillar.base.x + Math.cos(angle) * half
          const z = pillar.base.z + Math.sin(angle) * half
          const label = `floor${floor.floorIndex} ${pillar.mealType} @${step}`
          expect(`${label}:${insidePlan(outline, x, z)}`).toBe(`${label}:true`)
        }
      }
    }
  })
})
