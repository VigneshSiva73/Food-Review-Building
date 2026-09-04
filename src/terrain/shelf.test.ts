import { describe, expect, it } from 'vitest'
import { buildCityLayout } from '@/city/cityLayout'
import { cityConfig, islandConfig } from '@/config'
import { shelfWeightAt } from './heightField'

/**
 * The flat shelf and the street grid have to be the same shape.
 *
 * This has now been reported three times as "the brown area is not covered by
 * roads", and each time the cause was the two drifting apart: the shelf was a
 * square around the origin while the grid is neither square about the origin
 * nor a fixed size, so the flat, unbuilt ground stuck out somewhere. These
 * assertions are the pin — they fail on the config change, not on the render.
 */
describe('the city shelf', () => {
  const layout = buildCityLayout()
  // The paved span, endpoints included — a road runs past the last centreline
  // out to the grid edge, and that tarmac needs level ground under it too.
  const ends = layout.roads.flatMap((r) => [r.center, r.from, r.to])
  const near = Math.min(...ends)
  const far = Math.max(...ends)
  // The kerb line: asphalt plus its walkway, which also needs level ground.
  const kerb = cityConfig.roads.mainHalfWidth + cityConfig.roads.sidewalkWidth

  it('is fully flat under every street, kerbs included', () => {
    for (const road of layout.roads) {
      for (const along of [road.from, (road.from + road.to) / 2, road.to]) {
        const x = road.axis === 'ew' ? along : road.center
        const z = road.axis === 'ew' ? road.center : along
        expect(shelfWeightAt(x, z)).toBe(1)
      }
    }
    for (const side of [near - kerb, far + kerb]) {
      expect(shelfWeightAt(side, 0)).toBe(1)
      expect(shelfWeightAt(0, side)).toBe(1)
    }
  })

  it('does not reach appreciably past the outermost street', () => {
    // One block of slack. More than that is plain nobody built on, which is
    // the thing being complained about.
    const slack = cityConfig.grid.pitch
    expect(islandConfig.shelf.maxX).toBeLessThan(far + slack)
    expect(islandConfig.shelf.maxZ).toBeLessThan(far + slack)
    expect(islandConfig.shelf.minX).toBeGreaterThan(near - slack)
    expect(islandConfig.shelf.minZ).toBeGreaterThan(near - slack)
  })

  it('has faded out well before the coast', () => {
    // The blend is what reads as brown too. It has to end near the city, not
    // trail halfway to the sea.
    expect(shelfWeightAt(islandConfig.shelf.maxX + islandConfig.shelf.blendMargin + 1, 0)).toBe(0)
    expect(islandConfig.shelf.blendMargin).toBeLessThan(cityConfig.grid.pitch * 4)
  })
})
