import { describe, expect, it } from 'vitest'
import { buildCityLayout } from '@/city/cityLayout'
import { buildHeightField } from './heightField'
import { buildSettlements } from './settlements'
import { buildRoads } from './roads'
import { buildCityAccess } from './cityAccess'

/**
 * The island's roads have to arrive at a street.
 *
 * Seeded from the whole shelf, a route finished at whichever square of city
 * ground it reached first, which was almost never a carriageway: from the air
 * the network stopped in the open a little short of the grid. These assertions
 * are about the join, which is the part a screenshot shows and a unit test can
 * actually pin down.
 */
describe('roads into the city', () => {
  const field = buildHeightField()
  const access = buildCityAccess(field)
  const layout = buildCityLayout()
  const roads = buildRoads(field, buildSettlements(field), undefined, access)

  /** Distance from a point to the nearest carriageway, 0 when on one. */
  const toStreet = (x: number, z: number) => {
    let best = Infinity
    for (const r of layout.roads) {
      const along = r.axis === 'ew' ? x : z
      const across = r.axis === 'ew' ? z : x
      if (along < r.from || along > r.to) continue
      best = Math.min(best, Math.max(0, Math.abs(across - r.center) - r.halfWidth))
    }
    return best
  }

  it('builds a network at all', () => {
    expect(access.seeds.length).toBeGreaterThan(0)
    expect(roads.length).toBeGreaterThan(0)
  })

  it('finishes every road on a city street', () => {
    for (const road of roads) {
      // `traceHome` walks from the settlement back to the seed, so the LAST
      // point is the one in the city.
      const end = road[road.length - 1]
      expect(toStreet(end.x, end.z)).toBeLessThan(20)
    }
  })

  it('never routes one across a city block', () => {
    for (const road of roads) {
      for (const p of road) {
        const i = Math.round((p.x + field.half) / field.step)
        const j = Math.round((p.z + field.half) / field.step)
        expect(access.blocked[j * field.size + i]).toBe(0)
      }
    }
  })
})
