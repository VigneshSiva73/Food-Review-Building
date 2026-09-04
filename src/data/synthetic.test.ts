import { describe, expect, it } from 'vitest'
import { buildLayout } from '@/building'
import { buildDeckInstances, buildPillarInstances } from '@/building/matrices'
import {
  buildCapitalInstances,
  buildFasciaInstances,
  buildGlassGeometry,
  buildMullionInstances,
  buildSoffitRibInstances,
} from '@/building/facade'
import { buildSlabGeometry } from '@/building/slabGeometry'
import { heroLayerGeometry } from '@/scene/resources'
import { triangleCount } from '@/scene/geometryStats'
import { computeQualityTier } from '@/utils/quality'
import { isLeaveDayISO } from '@/utils/date'
import { syntheticDays } from './synthetic'

describe('syntheticDays', () => {
  const days = syntheticDays(300)

  it('produces exactly the requested number of valid days', () => {
    expect(days).toHaveLength(300)
    expect(new Set(days.map((d) => d.date)).size).toBe(300)
  })

  it('honours the calendar rules', () => {
    for (const day of days) {
      expect(isLeaveDayISO(day.date)).toBe(false)
      if (day.isSaturday) expect(day.meals.Dinner).toBeUndefined()
      else expect(Object.keys(day.meals)).toHaveLength(3)
      for (const meal of Object.values(day.meals)) {
        expect(meal.rating).toBeGreaterThanOrEqual(1)
        expect(meal.rating).toBeLessThanOrEqual(5)
      }
    }
  })

  it('is deterministic', () => {
    expect(syntheticDays(50)).toEqual(syntheticDays(50))
  })
})

describe('computeQualityTier', () => {
  it('gives desktop full quality', () => {
    const tier = computeQualityTier(1920, false)
    expect(tier).toMatchObject({ dpr: [1, 2], shadowMapSize: 2048, mullions: true })
  })

  it('tiers down for coarse pointers and narrow viewports', () => {
    for (const tier of [computeQualityTier(390, true), computeQualityTier(700, false)]) {
      expect(tier.dpr[1]).toBeLessThanOrEqual(1.5)
      expect(tier.shadowMapSize).toBe(1024)
      expect(tier.mullions).toBe(false)
    }
  })
})

describe('300-day rebuild cost (CPU proxy for plan §32 budgets)', () => {
  it('solves and builds all geometry data well under one second', () => {
    const start = performance.now()
    const layout = buildLayout(syntheticDays(300))
    buildPillarInstances(layout.floors)
    buildDeckInstances(layout.floors)
    buildMullionInstances(layout.floors)
    buildSlabGeometry(layout.floors)
    const elapsed = performance.now() - start

    expect(layout.floors).toHaveLength(300)
    expect(elapsed).toBeLessThan(1000)
  })

  it('stays within the triangle budget at 300 floors (all layers)', () => {
    const layout = buildLayout(syntheticDays(300))
    const floors = layout.floors
    const pillars = buildPillarInstances(floors)

    // Every term is counted from the geometry the scene actually submits.
    // Nothing here is a remembered constant: the column was articulated and
    // the edge beam profiled after the first version of this test was written,
    // and hardcoded figures would have gone on reporting the old cost.
    //
    // The deck ring beams are built by the pure layer but never rendered, so
    // they are excluded — the budget is for what is drawn.
    const layers = {
      glass: (buildGlassGeometry(floors).positions.length / 9) | 0,
      slab: (buildSlabGeometry(floors).positions.length / 9) | 0,
      pillars: (pillars.data.length + pillars.support.length) * triangleCount(heroLayerGeometry.pillars()),
      fascia:
        buildFasciaInstances(floors).transforms.length * triangleCount(heroLayerGeometry.fascias()),
      joints:
        buildCapitalInstances(floors).transforms.length * triangleCount(heroLayerGeometry.capitals()),
      basePlates: floors.length * 3 * triangleCount(heroLayerGeometry.deckNodes()),
      soffitRibs:
        buildSoffitRibInstances(floors).transforms.length * triangleCount(heroLayerGeometry.soffitRibs()),
    }
    const total = Object.values(layers).reduce((sum, n) => sum + n, 0)

    // Always-on layers at 300 synthetic floors: slab 14.4k, glass 1.8k,
    // columns 82.8k, edge beams 100.8k, joint heads 32.4k, base plates 21.6k,
    // soffit ribs 10.8k — 264.6k.
    //
    // Two of those grew when the plate corners were filleted. The plate itself
    // is now a fan around a twelve-point outline rather than two triangles,
    // and the edge beam follows that outline instead of cutting three straight
    // chords — which is the point, since a sharp-cornered beam wrapping a
    // rounded plate is worse than either alone. The real dataset is 65 floors,
    // so this is about 57k in practice; the 300-floor figure is a guard rail,
    // not a working load.
    expect(total).toBeLessThan(300_000)

    // The fins are the one layer the quality tier switches off, so they are
    // budgeted separately rather than folded into the figure above — a mobile
    // device never pays for them. They are far and away the most expensive
    // thing in the building, which is exactly why they are the first thing to
    // go, and they grew again when the footprint was sized to fill its site:
    // the spacing is fixed, so a wider elevation simply carries more of them.
    const fins =
      buildMullionInstances(floors).transforms.length *
      triangleCount(heroLayerGeometry.mullionFins())
    expect(total + fins).toBeLessThan(500_000)
    expect(computeQualityTier(390, true).mullions).toBe(false)

    // A floor as well as a ceiling. The failure this test really guards is a
    // derived count being replaced by a stale literal, which makes the total
    // *smaller* and sails under any upper bound — exactly how it went quietly
    // wrong once already.
    expect(total).toBeGreaterThan(220_000)

    // Per-unit bounds on the members instanced most often — a ceiling because
    // a column three times this size would be wrong even if the total fitted,
    // and a floor because each of these was deliberately articulated out of a
    // primitive. A total-based budget cannot see one layer quietly reverting
    // to a box: dropping the joint head back to twelve triangles still lands
    // inside both ends of the range above.
    //
    // The ceilings moved up when the columns and their collars became round.
    // A cylinder costs a segment count where a box costs four, and the collars
    // are stacked discs, so these are simply what a round member of this size
    // is worth. The total above is the budget that actually binds.
    const UNIT_BOX = 12
    const articulated = {
      pillars: [UNIT_BOX * 2, 120],
      fascias: [UNIT_BOX, 60],
      capitals: [UNIT_BOX, 90],
      deckNodes: [UNIT_BOX, 70],
    } as const
    for (const [layer, [min, max]] of Object.entries(articulated)) {
      const n = triangleCount(heroLayerGeometry[layer as keyof typeof articulated]())
      expect(`${layer}:${n > min && n < max}`).toBe(`${layer}:true`)
    }
  })
})
