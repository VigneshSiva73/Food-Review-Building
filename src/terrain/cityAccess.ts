import { buildCityLayout } from '@/city/cityLayout'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { HeightField } from './heightField'

/**
 * Where a road from the island is allowed to enter the city.
 *
 * The least-cost search was seeded from every cell of the flat shelf, so a
 * village road stopped at the first square of city ground it touched —
 * wherever on the perimeter that happened to be, which was almost never a
 * street. From the air the network simply stopped short of the grid.
 *
 * The fix is to make the shelf mean what it looks like: solid blocks with
 * streets through them. Everything on the shelf is impassable except the
 * carriageways, and the seeds are the carriageways themselves. A road arriving
 * from the north then has nowhere to finish but the end of a street, because
 * that is the only city ground the search can reach — the junction is a
 * consequence of the mask rather than something drawn on afterwards.
 */

export interface CityAccess {
  /** Lattice nodes that sit on a city carriageway. Seeds for the search. */
  seeds: number[]
  /** Terrain cells a route may not cross, indexed as the height field is. */
  blocked: Uint8Array
}

/** Extra width beyond the asphalt, so a route may aim at a kerb and still land. */
const APPROACH_MARGIN = 4

export function buildCityAccess(field: HeightField, c: IslandConfig = islandConfig): CityAccess {
  const layout = buildCityLayout()
  const stride = c.roads.stride
  const size = Math.floor(field.size / stride)

  const onRoad = new Uint8Array(field.size * field.size)
  const mark = (x: number, z: number) => {
    const i = Math.round((x + field.half) / field.step)
    const j = Math.round((z + field.half) / field.step)
    if (i < 0 || j < 0 || i >= field.size || j >= field.size) return
    onRoad[j * field.size + i] = 1
  }

  // Walk each carriageway at the terrain's own resolution, painting a band as
  // wide as the asphalt. Sampling the road rather than testing every cell
  // against every road keeps this linear in the length of the network.
  for (const road of layout.roads) {
    const half = road.halfWidth + APPROACH_MARGIN
    for (let along = road.from; along <= road.to; along += field.step / 2) {
      for (let across = -half; across <= half; across += field.step / 2) {
        if (road.axis === 'ew') mark(along, road.center + across)
        else mark(road.center + across, along)
      }
    }
  }

  const blocked = new Uint8Array(field.size * field.size)
  for (let n = 0; n < blocked.length; n++) {
    // Only the FULL shelf is built on. The blend beyond it is open ground and
    // a road may cross it freely, which is what lets a route run alongside the
    // city before turning in.
    blocked[n] = field.shelf[n] >= 1 && !onRoad[n] ? 1 : 0
  }

  const seeds: number[] = []
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const cell = j * stride * field.size + i * stride
      if (field.shelf[cell] >= 1 && onRoad[cell]) seeds.push(j * size + i)
    }
  }
  return { seeds, blocked }
}
