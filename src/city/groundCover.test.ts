import { describe, expect, it } from 'vitest'
import { cityConfig, roadReserve } from '@/config'
import { GROUND_LAYERS } from '@/scene/city/cityResources'
import { buildGroundCover } from './groundCover'
import {
  buildCityBuildings,
  buildCityLayout,
  facilityAt,
  isThemeParkBlock,
  seamCoord,
} from '@/city'

const cover = buildGroundCover()

/** Which block a patch's centre falls in. */
function blockOf(x: number, z: number): { bx: number; bz: number } {
  const find = (v: number) => {
    for (let b = -cityConfig.grid.midRadius; b <= cityConfig.grid.midRadius; b++) {
      if (v > seamCoord(b - 1) && v < seamCoord(b)) return b
    }
    return NaN
  }
  return { bx: find(x), bz: find(z) }
}

describe('buildGroundCover', () => {
  it('is deterministic', () => {
    expect(buildGroundCover()).toEqual(cover)
  })

  it('greens every open block in the city', () => {
    const blocks = new Set(cover.map((p) => JSON.stringify(blockOf(p.cx, p.cz))))
    expect(blocks.size).toBeGreaterThan(120)
    expect(new Set(cover.map((p) => p.kind))).toEqual(new Set(['lawn', 'meadow', 'garden']))
  })

  it('lays no grass across a street', () => {
    const reserve = roadReserve(true)
    for (const p of cover) {
      const { bx, bz } = blockOf(p.cx, p.cz)
      expect(Number.isNaN(bx) || Number.isNaN(bz)).toBe(false)
      expect(p.cx - p.halfW).toBeGreaterThanOrEqual(seamCoord(bx - 1) + reserve - 1e-6)
      expect(p.cx + p.halfW).toBeLessThanOrEqual(seamCoord(bx) - reserve + 1e-6)
      expect(p.cz - p.halfD).toBeGreaterThanOrEqual(seamCoord(bz - 1) + reserve - 1e-6)
      expect(p.cz + p.halfD).toBeLessThanOrEqual(seamCoord(bz) - reserve + 1e-6)
    }
  })

  it('never lays grass under a building', () => {
    // The invariant that actually matters, and the one that survived the grass
    // spreading into built blocks. Landscaping around a building is exactly
    // what the brief's ROAD / SIDEWALK / LANDSCAPING / BUILDING sequence asks
    // for, so "only on open blocks" stopped being true on purpose — but grass
    // drawn UNDER a footprint would be waste at best and z-fighting at worst.
    const buildings = buildCityBuildings(buildCityLayout(), 'high')
    const clashes: string[] = []
    for (const b of buildings) {
      // Axis-aligned test against the yawed footprint's own extent.
      const cos = Math.abs(Math.cos(b.rotationY))
      const sin = Math.abs(Math.sin(b.rotationY))
      const ex = (b.width / 2) * cos + (b.depth / 2) * sin
      const ez = (b.width / 2) * sin + (b.depth / 2) * cos
      for (const p of cover) {
        if (
          Math.abs(p.cx - b.position.x) < ex - p.halfW &&
          Math.abs(p.cz - b.position.z) < ez - p.halfD
        ) {
          clashes.push(`${b.id}`)
          break
        }
      }
    }
    expect(clashes).toEqual([])
  })

  it('gives a park an irregular edge rather than a square one', () => {
    // "Do not create perfectly square parks everywhere". Several overlapping
    // patches per block is what buys that, so every block must have more than
    // one — a lone rectangle IS the square park.
    const perBlock = new Map<string, number>()
    for (const p of cover) {
      const b = blockOf(p.cx, p.cz)
      // Facility grounds are excluded: a playing field is a rectangle on
      // purpose, and a hospital's lawn is bounded by its own car park.
      // The theme park's lawn is one rectangle bounded by its own midway and
      // rides, so it is excluded for the same reason a playing field is.
      if (facilityAt(b) || isThemeParkBlock(b)) continue
      const key = `${b.bx}:${b.bz}`
      perBlock.set(key, (perBlock.get(key) ?? 0) + 1)
    }
    expect(Math.min(...perBlock.values())).toBeGreaterThan(1)
  })

  it('sits above the terrain and UNDER every road surface', () => {
    // The ordering that stopped the roads coming out green. Grass has to clear
    // the terrain — the island's shelf is exactly zero, so anything at zero
    // z-fights it — and stay under the asphalt and the paint, because a lawn
    // meeting a carriageway will otherwise draw over it.
    for (const p of cover) {
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(GROUND_LAYERS.asphaltEw)
      expect(p.y).toBeLessThan(GROUND_LAYERS.markings)
      expect(p.y).toBeLessThan(cityConfig.roads.curbHeight)
    }
  })
})
