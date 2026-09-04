import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildingConfig, moduleHeight } from '@/config'
import { runPipeline } from '@/data/pipeline'
import type { DailyReview, MealType } from '@/types'
import { weekdayOfISO } from '@/utils/date'
import { planeNormal } from '@/utils/plane'
import { heightForRating } from './heights'
import { solveFloor } from './floorSolver'
import { buildLayout } from './layoutSolver'
import { footprintCorners, footprintRadius } from './triangle'

const MH = moduleHeight() // pillarHeightMax + slab + deck + facade gap

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

describe('heightForRating', () => {
  // Derived from config so a deliberate re-proportioning never silently
  // breaks the mapping, but an accidental one still does.
  const MIN = buildingConfig.pillarHeightMin
  const MAX = buildingConfig.pillarHeightMax

  it('maps the rating range linearly onto pillar heights', () => {
    expect(heightForRating(1)).toBe(MIN)
    expect(heightForRating(3)).toBeCloseTo((MIN + MAX) / 2)
    expect(heightForRating(5)).toBe(MAX)
  })

  it('clamps out-of-range ratings to the height bounds', () => {
    expect(heightForRating(0.2)).toBe(MIN)
    expect(heightForRating(7)).toBe(MAX)
  })
})

describe('footprint triangle', () => {
  const [a, b, c] = footprintCorners()

  it('front edge has the configured side length, symmetric about x=0', () => {
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(buildingConfig.triangleSide)
    expect(a.x).toBeCloseTo(-b.x)
    expect(a.z).toBeCloseTo(b.z)
  })

  it('rear (Dinner) corner is pushed back beyond the equilateral position', () => {
    // Measured from the front edge, not from the world origin. The absolute
    // z positions moved when the footprint was centred on its own extent, and
    // what this is actually about is the triangle's proportions: the rear
    // corner stands further off the front edge than an equilateral would put
    // it, which is what stops the plan reading as a regular triangle.
    const equilateralHeight = (buildingConfig.triangleSide * Math.sqrt(3)) / 2
    expect(c.x).toBeCloseTo(0)
    expect(a.z - c.z).toBeGreaterThan(equilateralHeight)
  })

  it('sits centred on the origin, which is where its plaza is', () => {
    // A triangle's centroid is a third of the way up its height, so centring
    // by centroid leaves the plan reaching much further behind the origin than
    // in front — and `rearCornerOffset` used to add to that rather than be
    // compensated for. Balancing the extent is what reads as centred on a
    // square site.
    const zs = [a.z, b.z, c.z]
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(0)
    const xs = [a.x, b.x, c.x]
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0)
  })

  it('bounding radius covers the farthest corner plus pillar overhang', () => {
    // Whichever corner that is. Centring the plan made the two front corners
    // the outermost, where the rear one had been — an assumption worth not
    // baking in twice.
    const farthest = Math.max(...[a, b, c].map((p) => Math.hypot(p.x, p.z)))
    expect(footprintRadius()).toBeCloseTo(farthest + buildingConfig.pillarWidth)
  })
})

describe('planeNormal', () => {
  it('is straight up for equal corner heights', () => {
    const n = planeNormal({ x: -6, y: 5, z: 3 }, { x: 6, y: 5, z: 3 }, { x: 0, y: 5, z: -8 })
    expect(n.x).toBeCloseTo(0)
    expect(n.y).toBeCloseTo(1)
    expect(n.z).toBeCloseTo(0)
  })

  it('tilts away from a raised corner and stays unit-length upward', () => {
    const n = planeNormal({ x: -6, y: 5, z: 3 }, { x: 6, y: 7, z: 3 }, { x: 0, y: 5, z: -8 })
    expect(n.x).toBeLessThan(0) // higher Lunch (front-right) → normal leans left
    expect(n.y).toBeGreaterThan(0)
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1)
  })
})

describe('solveFloor — weekday', () => {
  const floor = solveFloor(
    makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }),
    4,
    10,
  )

  it('places pillars on the module base with rating-driven heights', () => {
    const [b, l, d] = floor.pillars
    // The module base is the flat top of the plate below, so columns start
    // there directly — no deck-thickness offset leaving a void.
    const pillarBaseY = 10
    expect(floor.pillars.every((p) => p.base.y === pillarBaseY)).toBe(true)
    expect(b.height).toBeCloseTo(heightForRating(3))
    expect(l.height).toBeCloseTo(buildingConfig.pillarHeightMax)
    expect(d.height).toBeCloseTo(buildingConfig.pillarHeightMin)
    expect(floor.pillars.map((p) => p.mealType)).toEqual(['Breakfast', 'Lunch', 'Dinner'])
    expect(floor.pillars.every((p) => p.isData)).toBe(true)
  })

  it('rests the slab exactly on the three pillar tops', () => {
    floor.slab.corners.forEach((corner, i) => {
      const p = floor.pillars[i]
      expect(corner.y).toBeCloseTo(p.base.y + p.height)
      expect(corner.x).toBeCloseTo(p.base.x)
      expect(corner.z).toBeCloseTo(p.base.z)
    })
    expect(floor.slab.normal.y).toBeGreaterThan(0)
    expect(floor.slab.normal.x).toBeLessThan(0) // tall Lunch corner tips it left
  })

  it('keeps slab top below the next deck by at least the facade gap', () => {
    expect(floor.deckY).toBeCloseTo(10 + MH)
    const maxSlabTop =
      Math.max(...floor.slab.corners.map((p) => p.y)) + buildingConfig.slabThickness
    expect(floor.deckY - maxSlabTop).toBeGreaterThanOrEqual(buildingConfig.facadeMinGap - 1e-9)
  })

  it('carries full metadata on every pillar', () => {
    expect(floor.pillars[1].meta).toEqual({
      date: '2026-06-04',
      mealType: 'Lunch',
      rating: 5,
      vendor: 'Smith',
      floorIndex: 4,
      isData: true,
    })
  })
})

describe('solveFloor — Saturday / missing meal', () => {
  const floor = solveFloor(makeDay('2026-06-06', { Breakfast: 2, Lunch: 4 }), 2, 0)

  it('replaces the missing Dinner with a non-data support at the mean height', () => {
    const dinner = floor.pillars[2]
    expect(dinner.isData).toBe(false)
    expect(dinner.height).toBeCloseTo((heightForRating(2) + heightForRating(4)) / 2)
    expect(dinner.meta.rating).toBeUndefined()
    expect(dinner.meta.vendor).toBeUndefined()
    expect(floor.availableMeals).toEqual(['Breakfast', 'Lunch'])
  })

  it('still produces a three-point slab', () => {
    expect(floor.slab.corners).toHaveLength(3)
    expect(floor.slab.normal.y).toBeGreaterThan(0)
  })
})

describe('buildLayout', () => {
  it('returns an empty layout for zero days', () => {
    const layout = buildLayout([])
    expect(layout.floors).toEqual([])
    expect(layout.totalHeight).toBe(0)
  })

  it('stacks every review day as one constant module, gaps and all', () => {
    // Non-review days used to open a recessed band here. They no longer do, so
    // a Sunday between two floors leaves nothing behind: the stack is one
    // uninterrupted run of modules whatever the calendar did.
    const layout = buildLayout([
      makeDay('2026-06-06', { Breakfast: 3, Lunch: 3 }), // Saturday
      makeDay('2026-06-08', { Breakfast: 3, Lunch: 3, Dinner: 3 }), // Monday
      makeDay('2026-06-09', { Breakfast: 3, Lunch: 3, Dinner: 3 }),
    ])
    expect(layout.floors.map((f) => f.baseY)).toEqual([0, MH, 2 * MH])
    expect(layout.totalHeight).toBeCloseTo(3 * MH)
  })

  it('spans a merged weekend without a trace of it', () => {
    // Friday to Monday: the third Saturday and the Sunday are both absent, and
    // the two floors still sit one module apart.
    const layout = buildLayout([
      makeDay('2026-06-19', { Breakfast: 3, Lunch: 3, Dinner: 3 }), // Friday
      makeDay('2026-06-22', { Breakfast: 3, Lunch: 3, Dinner: 3 }), // Monday
    ])
    expect(layout.floors[1].baseY).toBeCloseTo(MH)
  })
})

describe('buildLayout on the real generated dataset', () => {
  const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
  const layout = buildLayout(runPipeline(csvText).days)

  it('produces one floor per review day, and nothing between them', () => {
    expect(layout.floors).toHaveLength(497)
    // Every floor sits exactly one module above the one below it.
    for (let i = 1; i < layout.floors.length; i++) {
      expect(layout.floors[i].baseY - layout.floors[i - 1].baseY).toBeCloseTo(MH)
    }
  })

  it('has sequential floor indices and strictly increasing elevations', () => {
    layout.floors.forEach((f, i) => {
      expect(f.floorIndex).toBe(i)
      if (i > 0) expect(f.baseY).toBeGreaterThan(layout.floors[i - 1].baseY)
    })
  })

  it('accumulates the exact expected total height', () => {
    expect(layout.totalHeight).toBeCloseTo(layout.floors.length * MH)
  })

  it('contains no NaN and no geometry outside its module band', () => {
    for (const f of layout.floors) {
      for (const p of f.pillars) {
        expect(Number.isFinite(p.base.x + p.base.y + p.base.z + p.height)).toBe(true)
        expect(p.height).toBeGreaterThanOrEqual(buildingConfig.pillarHeightMin)
        expect(p.height).toBeLessThanOrEqual(buildingConfig.pillarHeightMax)
      }
      const maxSlabTop = Math.max(...f.slab.corners.map((p) => p.y)) + f.slab.thickness
      expect(maxSlabTop).toBeLessThanOrEqual(f.deckY - buildingConfig.facadeMinGap + 1e-9)
      expect(Number.isFinite(f.slab.normal.y)).toBe(true)
    }
  })

  it('leaves no vertical gap between consecutive days', () => {
    // Each day's columns must start exactly where the module below tops out,
    // so the stack is continuous. With the leave bands gone there are no
    // exceptions left to skip: every pair of neighbours has to meet.
    for (let i = 0; i < layout.floors.length - 1; i++) {
      const below = layout.floors[i]
      for (const p of layout.floors[i + 1].pillars) {
        expect(p.base.y).toBeCloseTo(below.deckY)
      }
    }
  })

  it('marks exactly the 66 Saturdays with a non-data Dinner support', () => {
    const supports = layout.floors.filter((f) => !f.pillars[2].isData)
    expect(supports).toHaveLength(66)
    expect(supports.every((f) => f.availableMeals.length === 2)).toBe(true)
  })
})
