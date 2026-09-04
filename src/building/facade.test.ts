import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildingConfig, moduleHeight, slabOverhang } from '@/config'
import { composeInstance } from '@/scene/instancing'
import type { DailyReview, MealType } from '@/types'
import { weekdayOfISO } from '@/utils/date'
import {
  buildCapitalInstances,
  buildFasciaInstances,
  buildGlassGeometry,
  glassVertsPerFloor,
  inflateGlass,
  buildSoffitRibInstances,
  buildMullionInstances,
  slabSoffitY,
  slabTopY,
} from './facade'
import { plateOutline as platePlan, slabOutlineLength } from './slabGeometry'
import { solveFloor } from './floorSolver'
import { variationFor } from './variation'

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

const tiltedFloor = solveFloor(makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }), 0, 0)
const flatFloor = solveFloor(makeDay('2026-06-05', { Breakfast: 3, Lunch: 3, Dinner: 3 }), 1, 7.7)

describe('slabTopY', () => {
  it('returns pillar-top + vertical slab thickness at each corner', () => {
    for (const p of tiltedFloor.pillars) {
      const expected =
        p.base.y +
        p.height +
        buildingConfig.slabThickness / tiltedFloor.slab.normal.y
      expect(slabTopY(p.base.x, p.base.z, tiltedFloor.slab)).toBeCloseTo(expected)
    }
  })

  it('is flat for an untilted slab', () => {
    const y1 = slabTopY(0, 0, flatFloor.slab)
    const y2 = slabTopY(3, -4, flatFloor.slab)
    expect(y1).toBeCloseTo(y2)
  })
})

/** The plate outline in plan — the same one the fascia beam wraps. */
function plateOutlinePlan() {
  const corners = tiltedFloor.pillars.map((p) => ({ x: p.base.x, y: 0, z: p.base.z })) as [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
  ]
  return platePlan(corners, slabOverhang(), buildingConfig.plateCornerSegments)
}

describe('buildGlassGeometry', () => {
  const data = buildGlassGeometry([tiltedFloor])

  it('glazes the open storey, not the band above the plate', () => {
    // The invariant this phase exists for. The previous span ran from the slab
    // TOP to the next deck — a clerestory ribbon between days, which was
    // removed from the design long ago; the stale maths survived here only
    // because nothing rendered it. Glass now fills the volume the columns
    // stand in, capped by the underside of the plate.
    const positions = data.positions
    expect(positions.length).toBe(glassVertsPerFloor() * 3)
    // The vertices are Float32Array and the bound is computed in double, so
    // the slack has to be RELATIVE. A fixed 1e-6 is finer than a float32 can
    // represent above about 8 units, and it duly failed the first time the
    // tower grew — on a rounding step, not on any glass in the wrong place.
    const slack = (v: number) => Math.abs(v) * 2 ** -22 + 1e-6
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]]
      // With no floor beneath it, a lone floor's glass starts at its own base.
      expect(y).toBeGreaterThanOrEqual(tiltedFloor.baseY - slack(tiltedFloor.baseY))
      // Up to the soffit and no further: never in the plate, never above it.
      const soffit = slabSoffitY(x, z, tiltedFloor.slab)
      expect(y).toBeLessThanOrEqual(soffit + slack(soffit))
    }
    // And well clear of the deck the old span reached for.
    expect(Math.max(...[...positions].filter((_, i) => i % 3 === 1))).toBeLessThan(
      tiltedFloor.deckY - 1,
    )
  })

  it('lets the head follow the tilt, so the rating still drives it', () => {
    // The ceiling is the soffit, so a well-rated meal gets taller glass. The
    // glazing is another reading of the same number, never a second channel.
    const heights = [0, 1, 2].map((corner) => {
      const p = tiltedFloor.pillars[corner].base
      return slabSoffitY(p.x, p.z, tiltedFloor.slab) - tiltedFloor.baseY
    })
    expect(new Set(heights.map((h) => h.toFixed(3))).size).toBeGreaterThan(1)
  })

  it('glazes the three elevations flush with the plate edge', () => {
    // The line has been wrong twice — set back behind the columns, then on the
    // column centreline while the plate still reached further out — so this
    // pins it to the outline the plate and its fascia beam already use.
    const key = (x: number, z: number) => `${x.toFixed(3)},${z.toFixed(3)}`
    const allowed = new Set(plateOutlinePlan().map((q) => key(q.x, q.z)))
    // Returns land on the column walls, which are not on the outline.
    const reach = (buildingConfig.pillarWidth / 2) * 0.98
    for (const p of tiltedFloor.pillars) {
      for (const q of plateOutlinePlan()) {
        const dx = q.x - p.base.x
        const dz = q.z - p.base.z
        const len = Math.hypot(dx, dz)
        allowed.add(key(p.base.x + (dx / len) * reach, p.base.z + (dz / len) * reach))
      }
    }
    for (let i = 0; i < data.positions.length; i += 3) {
      expect(allowed.has(key(data.positions[i], data.positions[i + 2]))).toBe(true)
    }
  })

  it('carries the glass into every column, so no slot shows beside one', () => {
    // The gap this closed: the panes stopped on the elevation plane, which at
    // a corner is `plateEdgeRadius` out while the column wall is only half its
    // width out, leaving open reveal down both sides of every column.
    //
    // A return lands a hair INSIDE the wall — far enough to overlap so no
    // hairline of daylight survives, not so far that a smoked pane sweeps the
    // whole corner and tints the column it is meant to leave on show.
    const wall = buildingConfig.pillarWidth / 2
    for (const pillar of tiltedFloor.pillars) {
      let nearest = Infinity
      for (let i = 0; i < data.positions.length; i += 3) {
        nearest = Math.min(
          nearest,
          Math.hypot(data.positions[i] - pillar.base.x, data.positions[i + 2] - pillar.base.z),
        )
      }
      expect(nearest).toBeLessThan(wall)
      expect(nearest).toBeGreaterThan(wall * 0.9)
    }
  })

  it('leaves each column showing through its corner slot', () => {
    // The returns are radial and 120° apart; the sector between them faces
    // outward along the bisector and must stay open, because that is the slot
    // the column shows through — and the columns carry the meal ratings.
    const outline = plateOutlinePlan()
    const period = buildingConfig.plateCornerSegments + 1
    const key = (x: number, z: number) => `${x.toFixed(3)},${z.toFixed(3)}`
    const glass = new Set<string>()
    for (let i = 0; i < data.positions.length; i += 3) {
      glass.add(key(data.positions[i], data.positions[i + 2]))
    }
    for (let corner = 0; corner < 3; corner++) {
      // Every arc point strictly between the two tangent points is unglazed.
      for (let step = 1; step < buildingConfig.plateCornerSegments; step++) {
        const p = outline[corner * period + step]
        expect(glass.has(key(p.x, p.z))).toBe(false)
      }
    }
  })

  it('never reaches past the plate it is flush with', () => {
    // Flush is the target, not proud: glass standing outside the slab edge
    // would be worse than the ledge this replaced.
    const centroid = { x: 0, z: 0 }
    for (const p of tiltedFloor.pillars) {
      centroid.x += p.base.x / 3
      centroid.z += p.base.z / 3
    }
    const plateReach = Math.max(
      ...plateOutlinePlan().map((q) => Math.hypot(q.x - centroid.x, q.z - centroid.z)),
    )
    for (let i = 0; i < data.positions.length; i += 3) {
      const reach = Math.hypot(data.positions[i] - centroid.x, data.positions[i + 2] - centroid.z)
      expect(reach).toBeLessThanOrEqual(plateReach + 1e-3)
    }
  })

  it('lands on the plate below, so no daylight shows under a floor', () => {
    // The gap this closed, and the speckling that closing it wrongly caused.
    // `buildSlabGeometry` raises every plate's top face to `deckY`, and the
    // next module's `baseY` is that same `deckY` — so the glass starting at
    // its own `baseY` lands exactly on the concrete below. Reaching for
    // `slabTopY` instead (the parallel extrusion of the tilted soffit) put the
    // glass inside the plate and z-fought across every elevation.
    const lower = solveFloor(makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }), 0, 0)
    const upper = solveFloor(
      makeDay('2026-06-05', { Breakfast: 4, Lunch: 2, Dinner: 3 }),
      1,
      moduleHeight(),
    )
    expect(upper.baseY).toBeCloseTo(lower.deckY)
    const stacked = buildGlassGeometry([lower, upper])
    const per = glassVertsPerFloor()
    for (let i = per * 3; i < stacked.positions.length; i += 3) {
      const [x, y, z] = [stacked.positions[i], stacked.positions[i + 1], stacked.positions[i + 2]]
      const ceiling = slabSoffitY(x, z, upper.slab)
      expect(y).toBeGreaterThanOrEqual(upper.baseY - 1e-3)
      expect(y).toBeLessThanOrEqual(ceiling + 1e-3)
      // Never floating between the two: a vertex is on one end or the other.
      const touches = Math.abs(y - upper.baseY) < 1e-3 || Math.abs(y - ceiling) < 1e-3
      expect(touches).toBe(true)
    }
    // And strictly above the plate below, never buried in it.
    for (let i = per * 3 + 1; i < stacked.positions.length; i += 3) {
      expect(stacked.positions[i]).toBeGreaterThanOrEqual(lower.deckY - 1e-3)
    }
  })

  it('stays with its own floor when the view explodes', () => {
    // Floors pulled more than a module apart must not have their glass
    // stretched across the gap to reach the plate below.
    const lower = solveFloor(makeDay('2026-06-04', { Breakfast: 3, Lunch: 5, Dinner: 1 }), 0, 0)
    const far = solveFloor(
      makeDay('2026-06-05', { Breakfast: 4, Lunch: 2, Dinner: 3 }),
      1,
      moduleHeight() * 3,
    )
    const exploded = buildGlassGeometry([lower, far])
    const per = glassVertsPerFloor()
    let lowest = Infinity
    for (let i = per * 3 + 1; i < exploded.positions.length; i += 3) {
      lowest = Math.min(lowest, exploded.positions[i])
    }
    // Its own base, three modules up — not stretched down to the plate below.
    expect(lowest).toBeCloseTo(far.baseY, 3)
  })

  it('lets a ray resolve any pane back to its floor', () => {
    // The contract picking depends on. A hit hands back a faceIndex and the
    // floor is read at `floorIndex[faceIndex * 3]`, so every triangle of a
    // floor has to carry that floor — not just the first vertex of the first
    // one. This attribute was written from the start and read by nothing until
    // the glazing became pickable, which is exactly how it could have been
    // quietly wrong.
    const two = buildGlassGeometry([tiltedFloor, flatFloor])
    const faces = two.floorIndex.length / 3
    for (let face = 0; face < faces; face++) {
      const at = two.floorIndex[face * 3]
      expect(two.floorIndex[face * 3 + 1]).toBe(at)
      expect(two.floorIndex[face * 3 + 2]).toBe(at)
    }
    expect(new Set([...two.floorIndex])).toEqual(
      new Set([tiltedFloor.floorIndex, flatFloor.floorIndex]),
    )
  })

  it('tags every vertex with its floor and its day tone', () => {
    const two = buildGlassGeometry([tiltedFloor, flatFloor])
    expect(two.floorIndex.length).toBe(two.positions.length / 3)
    expect(two.floorIndex.length).toBe(2 * glassVertsPerFloor())
    expect(two.tint.length).toBe(two.positions.length)
    const per = glassVertsPerFloor()
    expect([...two.floorIndex.slice(0, per)]).toEqual(Array(per).fill(tiltedFloor.floorIndex))
    expect([...two.floorIndex.slice(per)]).toEqual(Array(per).fill(flatFloor.floorIndex))
    // Two different days must not glaze identically.
    expect(two.tint[0]).not.toBeCloseTo(two.tint[per * 3], 6)
  })
})

describe('buildMullionInstances', () => {
  const mullions = buildMullionInstances([tiltedFloor]).transforms

  it('creates fins on all three edges with positive heights', () => {
    expect(mullions.length).toBeGreaterThanOrEqual(3 * 2)
    for (const m of mullions) {
      expect(m.scale.y).toBeGreaterThan(0)
      // Local +z runs along the facade, so thickness is z and projection is x.
      expect(m.scale.z).toBe(buildingConfig.mullionWidth)
      expect(m.scale.x).toBe(buildingConfig.mullionDepth)
      expect(m.scale.x).toBeGreaterThan(m.scale.z)
    }
  })

  it('spans exactly the glazing it stands on', () => {
    for (const m of mullions) {
      const bottom = m.position.y - m.scale.y / 2
      const top = m.position.y + m.scale.y / 2
      expect(bottom).toBeCloseTo(tiltedFloor.baseY)
      expect(top).toBeCloseTo(slabSoffitY(m.position.x, m.position.z, tiltedFloor.slab))
    }
  })

  it('stays sparse enough not to read as a comb', () => {
    // Expressed as spacing, not as a count. What matters is the rhythm on the
    // elevation, and the count follows the building's width — pinning a number
    // would have failed the moment the footprint was resized to fill its site,
    // which says nothing about whether the fins look right.
    const glass = buildGlassGeometry([tiltedFloor])
    const plan = new Set<string>()
    for (let i = 0; i < glass.positions.length; i += 3) {
      plan.add(`${glass.positions[i].toFixed(3)},${glass.positions[i + 2].toFixed(3)}`)
    }
    const pts = [...plan].map((k) => k.split(',').map(Number))
    let perimeter = 0
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      perimeter += Math.hypot(b[0] - a[0], b[1] - a[1])
    }
    expect(perimeter / mullions.length).toBeGreaterThan(buildingConfig.mullionSpacing * 0.8)
  })

  it('spreads the fins by arc length, not a minimum per corner chord', () => {
    // A filleted corner is several very short chords. Placing a minimum number
    // of fins on each of them clusters every corner while the long elevations
    // stay sparse, which is the opposite of an even rhythm.
    const corner = tiltedFloor.pillars[0].base
    const near = mullions.filter(
      (m) => Math.hypot(m.position.x - corner.x, m.position.z - corner.z) < 8,
    )
    expect(near.length).toBeLessThan(6)
  })

  it('is deterministic per date', () => {
    expect(buildMullionInstances([tiltedFloor]).transforms).toEqual(mullions)
    expect(variationFor('2026-06-04')).toEqual(variationFor('2026-06-04'))
  })
})

describe('buildFasciaInstances', () => {
  it('wraps the plate outline with unit-direction beams', () => {
    // One beam per outline segment, so the run now includes the short chords
    // of each filleted corner as well as the three long straight sides. A beam
    // that still turned a sharp corner behind a rounded plate would be the
    // most visible line on the elevation disagreeing with the plate it wraps.
    const fascias = buildFasciaInstances([tiltedFloor]).transforms
    expect(fascias).toHaveLength(slabOutlineLength())
    for (const f of fascias) {
      expect(Math.hypot(f.align.x, f.align.y, f.align.z)).toBeCloseTo(1)
      expect(f.scale.z).toBeGreaterThan(0)
    }
    // The three long sides survive the fillet.
    const long = fascias.filter((f) => f.scale.z > buildingConfig.triangleSide * 0.5)
    expect(long).toHaveLength(3)
    // A tilted slab must produce at least one non-horizontal fascia.
    expect(fascias.some((f) => Math.abs(f.align.y) > 1e-3)).toBe(true)
  })

  it('rolls every beam so its profile sits square to the plate', () => {
    // The beam is no longer a box: it has a shadow gap on top and a drip notch
    // underneath. `align` alone leaves the roll about the beam axis to whatever
    // the minimal rotation from +z happens to give, which differs per edge — so
    // on a tilted floor the notch would end up on the top of one beam and the
    // inside of another. Handing over the slab normal is what fixes it.
    const n = tiltedFloor.slab.normal
    for (const f of buildFasciaInstances([tiltedFloor]).transforms) {
      expect(f.up).toBeDefined()
      expect(f.up).toEqual(n)
      // Not parallel to the beam, or there would be no roll to derive.
      const dot = f.up!.x * f.align.x + f.up!.y * f.align.y + f.up!.z * f.align.z
      expect(Math.abs(dot)).toBeLessThan(0.99)
    }
  })

  it('composes to a beam whose top face lies in the slab plane', () => {
    // The property that actually matters, checked on the matrix rather than on
    // the inputs: the local +y of every beam must agree with the plate normal.
    const n = new THREE.Vector3(
      tiltedFloor.slab.normal.x,
      tiltedFloor.slab.normal.y,
      tiltedFloor.slab.normal.z,
    )
    // The plate tilts by only about eight degrees, so a loose threshold here
    // would pass just as happily on a beam rolled to world-up. Confirm the two
    // are actually distinguishable before asserting which one won.
    // The plate tilts only about four degrees once the footprint fills its
    // site — the same rating spread over a much wider triangle — so the two
    // candidate ups are close. Still distinguishable, which is all this guard
    // has to establish before the assertion below picks between them.
    expect(n.dot(new THREE.Vector3(0, 1, 0))).toBeLessThan(0.999)
    for (const f of buildFasciaInstances([tiltedFloor]).transforms) {
      const e = composeInstance(f).elements
      const localUp = new THREE.Vector3(e[4], e[5], e[6]).normalize()
      expect(localUp.dot(n)).toBeGreaterThan(0.9999)
    }
  })
})

describe('buildSoffitRibInstances', () => {
  const ribs = buildSoffitRibInstances([tiltedFloor]).transforms
  const n = tiltedFloor.slab.normal
  const origin = tiltedFloor.slab.corners[0]
  /** Signed distance from the soffit plane; negative is below the plate. */
  const belowSoffit = (p: { x: number; y: number; z: number }) =>
    (p.x - origin.x) * n.x + (p.y - origin.y) * n.y + (p.z - origin.z) * n.z

  it('spans column to column, three per floor', () => {
    expect(ribs).toHaveLength(3)
    for (const r of ribs) {
      expect(Math.hypot(r.align.x, r.align.y, r.align.z)).toBeCloseTo(1)
      expect(r.scale.z).toBeGreaterThan(buildingConfig.triangleSide * 0.5)
    }
  })

  it('hangs beneath the plate, not on the module base', () => {
    // The invariant this whole member is defined by. A ring of beams at the
    // base datum was built once and removed: it read as a floor slab between
    // days, which this building does not have. Every rib centre must sit half
    // its own depth below the soffit plane.
    for (const r of ribs) {
      expect(belowSoffit(r.position)).toBeCloseTo(-buildingConfig.soffitRibDepth / 2, 6)
      // And nowhere near the base of the module.
      expect(r.position.y).toBeGreaterThan(tiltedFloor.baseY + 1)
    }
  })

  it('drops straight down from the plate, not straight down in world space', () => {
    for (const r of ribs) {
      expect(r.up).toEqual(n)
    }
  })

  it('stops short of the joint heads at either end', () => {
    // Ribs and joints both occupy the column head; overlapping them puts
    // concrete through steel at every corner of every floor.
    const capital = buildingConfig.pillarWidth * buildingConfig.capitalWidthFactor
    for (let i = 0; i < 3; i++) {
      const a = tiltedFloor.slab.corners[i]
      const b = tiltedFloor.slab.corners[(i + 1) % 3]
      const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      expect(ribs[i].scale.z).toBeLessThanOrEqual(span - capital + 1e-9)
    }
  })

  it('follows the floor when the view explodes', () => {
    // Derived from the floor's own corners and normal, so a lifted floor takes
    // its ribs with it. Anything deriving elevation from the floor index would
    // detach here.
    const lifted = {
      ...tiltedFloor,
      baseY: tiltedFloor.baseY + 50,
      deckY: tiltedFloor.deckY + 50,
      slab: {
        ...tiltedFloor.slab,
        corners: tiltedFloor.slab.corners.map((p) => ({ ...p, y: p.y + 50 })) as typeof tiltedFloor.slab.corners,
      },
    }
    const moved = buildSoffitRibInstances([lifted]).transforms
    for (let i = 0; i < 3; i++) {
      expect(moved[i].position.y).toBeCloseTo(ribs[i].position.y + 50, 6)
    }
  })
})

describe('buildCapitalInstances', () => {
  it('centres a capital on every pillar/slab contact point', () => {
    const capitals = buildCapitalInstances([tiltedFloor]).transforms
    expect(capitals).toHaveLength(3)
    capitals.forEach((cap, i) => {
      const p = tiltedFloor.pillars[i]
      expect(cap.position.y).toBeCloseTo(p.base.y + p.height)
      expect(cap.scale.x).toBeCloseTo(buildingConfig.pillarWidth * buildingConfig.capitalWidthFactor)
    })
  })
})

describe('variationFor', () => {
  it('stays within the configured amplitude', () => {
    for (const date of ['2026-06-04', '2026-07-15', '2026-08-21']) {
      const v = variationFor(date)
      const amp = buildingConfig.variationAmplitude
      expect(Math.abs(v.pillarWidthFactor - 1)).toBeLessThanOrEqual(amp)
      expect(Math.abs(v.fasciaFactor - 1)).toBeLessThanOrEqual(amp)
      expect(v.mullionPhase).toBeGreaterThanOrEqual(0)
      expect(v.mullionPhase).toBeLessThan(1)
      expect(Math.abs(v.concreteShade - 1)).toBeLessThanOrEqual(
        buildingConfig.concreteShadeAmplitude,
      )
    }
  })

  it('differs between dates (coherent, not identical)', () => {
    expect(variationFor('2026-06-04')).not.toEqual(variationFor('2026-06-05'))
  })

  it('keeps the existing draw order when a channel is added', () => {
    // The seeded sequence a date produces IS the tower's stability across
    // reloads. Inserting a new `spread()` call rather than appending it would
    // silently reshuffle every floor's proportions while every bounds check
    // above still passed, so these three are pinned to literal values.
    const v = variationFor('2026-06-04')
    expect(v.pillarWidthFactor.toFixed(9)).toBe('0.989880150')
    expect(v.fasciaFactor.toFixed(9)).toBe('1.011014435')
    expect(v.mullionPhase.toFixed(9)).toBe('0.259790941')
  })
})

describe('inflateGlass', () => {
  const source = buildGlassGeometry([tiltedFloor]).positions
  const shell = inflateGlass(source, 0.08)

  /** Unit face normal of the triangle starting at float index `i`. */
  const faceNormal = (i: number) => {
    const ux = source[i + 3] - source[i]
    const uy = source[i + 4] - source[i + 1]
    const uz = source[i + 5] - source[i + 2]
    const vx = source[i + 6] - source[i]
    const vy = source[i + 7] - source[i + 1]
    const vz = source[i + 8] - source[i + 2]
    const n = { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx }
    const len = Math.hypot(n.x, n.y, n.z)
    return { x: n.x / len, y: n.y / len, z: n.z / len }
  }

  it('moves every vertex exactly one offset along its own face normal', () => {
    expect(shell.length).toBe(source.length)
    for (let i = 0; i < source.length; i += 9) {
      const n = faceNormal(i)
      for (let k = 0; k < 9; k += 3) {
        const dx = shell[i + k] - source[i + k]
        const dy = shell[i + k + 1] - source[i + k + 1]
        const dz = shell[i + k + 2] - source[i + k + 2]
        expect(Math.hypot(dx, dy, dz)).toBeCloseTo(0.08, 5)
        expect(dx * n.x + dy * n.y + dz * n.z).toBeCloseTo(0.08, 5)
      }
    }
  })

  it('clears the corner returns as fully as the elevations', () => {
    // The reason this is per-face rather than radial from the tower axis. A
    // radial push separates a pane by `offset × cos(angle between them)`, and
    // the returns sit about thirty degrees off radial — so they would come out
    // roughly a sixth short of the elevations, which is where a shell starts
    // z-fighting the glass it is supposed to be covering.
    const centroid = { x: 0, z: 0 }
    for (const p of tiltedFloor.pillars) {
      centroid.x += p.base.x / 3
      centroid.z += p.base.z / 3
    }
    const wall = buildingConfig.pillarWidth / 2
    let returns = 0
    for (let i = 0; i < source.length; i += 9) {
      const touchesColumn = tiltedFloor.pillars.some((pillar) =>
        [0, 3, 6].some(
          (k) =>
            Math.hypot(source[i + k] - pillar.base.x, source[i + k + 2] - pillar.base.z) <
            wall + 1e-6,
        ),
      )
      if (!touchesColumn) continue
      returns++
      const n = faceNormal(i)
      // Radial direction at this triangle, in plan.
      const rx = source[i] - centroid.x
      const rz = source[i + 2] - centroid.z
      const rlen = Math.hypot(rx, rz)
      // Strictly short of a full offset under a radial push...
      expect(Math.abs((n.x * rx + n.z * rz) / rlen)).toBeLessThan(0.95)
    }
    expect(returns).toBe(12) // two returns per corner, two triangles each
    // ...while the first test above has already pinned that every one of them
    // moves a full offset along its own normal.
  })
})
