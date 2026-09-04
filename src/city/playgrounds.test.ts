import { describe, expect, it } from 'vitest'
import { buildPlaygrounds } from './playgrounds'
import { buildBlockTrees, buildHouses, isThemeParkBlock, facilityAt, zoneAt } from '@/city'

const grounds = buildPlaygrounds()

describe('buildPlaygrounds', () => {
  it('is deterministic', () => {
    expect(buildPlaygrounds()).toEqual(grounds)
  })

  it('puts them in parks that have houses round them', () => {
    // The point of the whole module: "near the houses" is not a property a
    // block has on its own, so this is generated from adjacency.
    expect(grounds.length).toBeGreaterThan(3)
    const houseBlocks = new Set(buildHouses().map((h) => `${h.block.bx}:${h.block.bz}`))
    for (const g of grounds) {
      expect(zoneAt(g.block)).toBe('park')
      expect(facilityAt(g.block)).toBeNull()
      expect(isThemeParkBlock(g.block)).toBe(false)
      const around = [
        `${g.block.bx + 1}:${g.block.bz}`,
        `${g.block.bx - 1}:${g.block.bz}`,
        `${g.block.bx}:${g.block.bz + 1}`,
        `${g.block.bx}:${g.block.bz - 1}`,
      ]
      const lived = around.filter((k) => {
        const [bx, bz] = k.split(':').map(Number)
        const zone = zoneAt({ bx, bz })
        return houseBlocks.has(k) || zone === 'residential' || zone === 'suburban'
      })
      expect(`${g.id}:${lived.length >= 2}`).toBe(`${g.id}:true`)
    }
  })

  it('keeps the equipment on its own surface', () => {
    for (const g of grounds) {
      for (const s of g.structures) {
        const d = Math.hypot(s.position.x - g.centre.x, s.position.z - g.centre.z)
        expect(d + s.size / 2).toBeLessThan(g.radius)
      }
    }
  })

  it('offers more than one thing to play on', () => {
    const kinds = new Set(grounds.flatMap((g) => g.structures.map((s) => s.kind)))
    expect(kinds.size).toBeGreaterThanOrEqual(2)
  })

  it('leaves a clearing rather than planting trees through the swings', () => {
    // Collected, then asserted once. Two thousand trees against thirty
    // playgrounds is sixty thousand comparisons, and an `expect` per pair took
    // longer than the whole rest of the suite.
    const trees = buildBlockTrees('high')
    const inside: string[] = []
    for (const g of grounds) {
      for (const t of trees) {
        const dx = t.position.x - g.centre.x
        const dz = t.position.z - g.centre.z
        if (dx * dx + dz * dz < g.radius * g.radius) inside.push(`${g.id}/${t.id}`)
      }
    }
    expect(inside).toEqual([])
  })
})
