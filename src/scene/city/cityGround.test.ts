import { describe, expect, it } from 'vitest'
import { CITY_GROUND_BIAS, GROUND_LAYERS } from './cityResources'
import { ISLAND_TERRAIN_OFFSET } from '../island/islandResources'
import { cityConfig } from '@/config'

/**
 * The city's ground has to be drawn ON the island, not in it.
 *
 * With the island on, its terrain is the surface every street, kerb, lawn and
 * lane marking lies upon — and a polygon offset decides which of two coplanar
 * surfaces wins. The asphalt was pushed further back than the ground beneath
 * it, so the ground drew over the roads. Nothing showed while that ground was
 * brown-grey and the asphalt nearly black; the moment the ground went green,
 * so did every road in the city.
 *
 * The two numbers live in different files, which is exactly why this exists.
 */
describe('city ground depth ordering', () => {
  it('draws every city ground layer in front of the island terrain', () => {
    for (const [name, factor] of Object.entries(CITY_GROUND_BIAS)) {
      expect(`${name}:${factor < ISLAND_TERRAIN_OFFSET}`).toBe(`${name}:true`)
    }
  })

  it('keeps the layers in their own order: earth, grass, road, kerb, paint', () => {
    const b = CITY_GROUND_BIAS
    // Lower factor draws nearer, so this reads back to front.
    expect(b.terrain).toBeGreaterThan(b.cover)
    expect(b.cover).toBeGreaterThan(b.asphalt)
    expect(b.asphalt).toBeGreaterThan(b.raised)
    expect(b.raised).toBeGreaterThan(b.markings)
  })

  it('agrees with the heights the same layers are built at', () => {
    // Offset and elevation must not disagree: a layer drawn nearer must also
    // sit no lower, or the two cues fight and the winner depends on the angle.
    expect(GROUND_LAYERS.terrain).toBeLessThan(cityConfig.groundCover.y)
    expect(cityConfig.groundCover.y).toBeLessThan(GROUND_LAYERS.asphaltEw)
    expect(GROUND_LAYERS.asphaltEw).toBeLessThan(GROUND_LAYERS.markings)
    expect(GROUND_LAYERS.markings).toBeLessThan(GROUND_LAYERS.kerbTop)
  })
})
