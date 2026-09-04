import { describe, expect, it } from 'vitest'
import { cityConfig, roadReserve } from '@/config'
import { buildHouses, isHouseBlock } from './houses'
import { buildCityBuildings, buildCityLayout, seamCoord, zoneAt } from '@/city'

const houses = buildHouses()
const layout = buildCityLayout()

describe('buildHouses', () => {
  it('is deterministic', () => {
    expect(buildHouses()).toEqual(houses)
  })

  it('builds a neighbourhood rather than a scatter', () => {
    expect(houses.length).toBeGreaterThan(500)
    const kinds = new Set(houses.map((h) => h.kind))
    expect(kinds.size).toBe(4)
  })

  it('stands every house on its own block, clear of the asphalt', () => {
    const reserve = roadReserve(true)
    for (const h of houses) {
      const minX = seamCoord(h.block.bx - 1) + reserve
      const maxX = seamCoord(h.block.bx) - reserve
      const minZ = seamCoord(h.block.bz - 1) + reserve
      const maxZ = seamCoord(h.block.bz) - reserve
      // The yawed footprint's true axis-aligned extent. The half-diagonal is
      // the worst case at 45 degrees and these are within three degrees of
      // square, so using it would fail a house that is comfortably inside.
      const cos = Math.abs(Math.cos(h.rotationY))
      const sin = Math.abs(Math.sin(h.rotationY))
      const ex = (h.width / 2) * cos + (h.depth / 2) * sin
      const ez = (h.width / 2) * sin + (h.depth / 2) * cos
      expect(h.position.x - ex).toBeGreaterThan(minX - 1)
      expect(h.position.x + ex).toBeLessThan(maxX + 1)
      expect(h.position.z - ez).toBeGreaterThan(minZ - 1)
      expect(h.position.z + ez).toBeLessThan(maxZ + 1)
    }
  })

  it('faces every house at the street it fronts', () => {
    // Modelled facing +Z, so the yaw has to turn that toward the nearest edge
    // of the block. A house with its back to the road is the single most
    // obvious tell that a suburb was generated rather than laid out.
    for (const h of houses.slice(0, 300)) {
      const front = { x: Math.sin(h.rotationY), z: Math.cos(h.rotationY) }
      const cx = (seamCoord(h.block.bx - 1) + seamCoord(h.block.bx)) / 2
      const cz = (seamCoord(h.block.bz - 1) + seamCoord(h.block.bz)) / 2
      // Away from the middle of its own block, which is where the gardens are.
      const outward = { x: h.position.x - cx, z: h.position.z - cz }
      expect(front.x * outward.x + front.z * outward.z).toBeGreaterThan(0)
    }
  })

  it('never puts an apartment block in the back gardens', () => {
    // A house block is laid out along its edges; the plot system would put a
    // building in the middle of it, which is exactly where the gardens are.
    for (const b of buildCityBuildings(layout, 'high')) {
      const plot = layout.plots.find((p) => `bld-${p.id}` === b.id)!
      expect(isHouseBlock(plot.block)).toBe(false)
    }
  })

  it('puts houses only where the zoning says people live', () => {
    for (const h of houses.slice(0, 400)) {
      const zone = zoneAt(h.block)
      expect(['suburban', 'residential']).toContain(zone)
    }
  })

  it('leaves the block corners clear', () => {
    // Two runs of houses meeting at right angles would otherwise overlap.
    for (const h of houses.slice(0, 400)) {
      const nearX = Math.min(
        Math.abs(h.position.x - seamCoord(h.block.bx - 1)),
        Math.abs(h.position.x - seamCoord(h.block.bx)),
      )
      const nearZ = Math.min(
        Math.abs(h.position.z - seamCoord(h.block.bz - 1)),
        Math.abs(h.position.z - seamCoord(h.block.bz)),
      )
      // At least one axis has to be well inside its edge; a house sitting
      // close to both is in a corner.
      expect(Math.max(nearX, nearZ)).toBeGreaterThan(cityConfig.houses.cornerClearance * 0.5)
    }
  })
})
