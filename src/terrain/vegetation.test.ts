import { describe, expect, it } from 'vitest'
import { nearSeam, seamCoord } from '@/city/cityLayout'
import { cityConfig, islandConfig } from '@/config'
import { buildHeightField } from './heightField'
import { buildTrees } from './vegetation'

/**
 * Where the island's forest stops.
 *
 * It used to stop at the shelf boundary, which left the wood a clear margin
 * short of the streets: the streets are drawn to one reach in both directions
 * while the block spans either side of the tower are seeded and do not come out
 * symmetric, so on two sides they overhang the last block by about two hundred
 * and fifty units. Nothing grew on that band — no blocks for the city to plant,
 * and no island either.
 *
 * The forest has it now. These are the two assertions that keep it honest: it
 * has to reach the streets, and it must not stand in them.
 */
describe('the forest at the city edge', () => {
  const field = buildHeightField()
  const trees = buildTrees(field, islandConfig.vegetation.count)
  const gridMin = seamCoord(-cityConfig.grid.midRadius - 1)
  const gridMax = seamCoord(cityConfig.grid.midRadius)

  it('fills the band the streets overhang', () => {
    const band = trees.filter(
      (t) =>
        (t.x < gridMin || t.x > gridMax || t.z < gridMin || t.z > gridMax) &&
        t.x > islandConfig.shelf.minX &&
        t.x < islandConfig.shelf.maxX &&
        t.z > islandConfig.shelf.minZ &&
        t.z < islandConfig.shelf.maxZ,
    )
    expect(band.length).toBeGreaterThan(1000)
  })

  it('keeps out of the block grid, where the city does its own planting', () => {
    const trespassing = trees.filter(
      (t) => t.x > gridMin && t.x < gridMax && t.z > gridMin && t.z < gridMax,
    )
    expect(trespassing).toEqual([])
  })

  it('keeps off the tarmac', () => {
    // Asked of every tree, not only the ones in the band: the same question
    // the road paint and the lamp posts ask, so the answers agree.
    const onRoad = trees.filter((t) => nearSeam(t.x, 0) && nearSeam(t.z, 0))
    expect(onRoad).toEqual([])
  })
})
