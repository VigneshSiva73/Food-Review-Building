import { describe, expect, it } from 'vitest'
import { roadReserve } from '@/config'
import { buildThemePark, isThemeParkBlock, themeParkPaving } from './themePark'
import { buildCityBuildings, buildCityLayout, buildHouses, onMajorRoad, seamCoord, zoneAt } from '@/city'

const park = buildThemePark()!
const layout = buildCityLayout()

describe('buildThemePark', () => {
  it('is deterministic, and there is one', () => {
    expect(park).not.toBeNull()
    expect(buildThemePark()).toEqual(park)
  })

  it('takes a large open block people can drive to', () => {
    expect(['park', 'undeveloped']).toContain(zoneAt(park.block))
    expect(onMajorRoad(park.block)).toBe(true)
    expect(Math.min(park.bounds.halfW, park.bounds.halfD) * 2).toBeGreaterThan(150)
  })

  it('keeps every attraction inside the boundary', () => {
    // "Keep the attractions concentrated inside a defined park boundary."
    for (const a of park.attractions) {
      const dx = Math.abs(a.position.x - park.bounds.cx)
      const dz = Math.abs(a.position.z - park.bounds.cz)
      expect(dx + a.radius).toBeLessThanOrEqual(park.bounds.halfW + 1)
      expect(dz + a.radius).toBeLessThanOrEqual(park.bounds.halfD + 1)
    }
  })

  it('hangs the rides off a midway rather than scattering them', () => {
    // Every ride must be near the path — that is the difference between a
    // fairground and a field with rides dropped in it.
    for (const a of park.attractions) {
      let best = Infinity
      for (const p of park.path) {
        best = Math.min(best, Math.hypot(p.x - a.position.x, p.z - a.position.z))
      }
      expect(best).toBeLessThan(Math.max(park.bounds.halfW, park.bounds.halfD))
    }
    // And they must not all be on one side of it, which would read as a street.
    const path = park.path
    const sides = park.attractions.map((a) => {
      const mid = path[Math.floor(path.length / 2)]
      const end = path[path.length - 1]
      const dx = end.x - mid.x
      const dz = end.z - mid.z
      return Math.sign(dx * (a.position.z - mid.z) - dz * (a.position.x - mid.x))
    })
    expect(new Set(sides).size).toBeGreaterThan(1)
  })

  it('offers more than one kind of ride', () => {
    expect(new Set(park.attractions.map((a) => a.kind)).size).toBeGreaterThanOrEqual(4)
  })

  it('paves a midway and a car park inside its own block', () => {
    const reserve = roadReserve(true)
    const minX = seamCoord(park.block.bx - 1) + reserve
    const maxX = seamCoord(park.block.bx) - reserve
    const minZ = seamCoord(park.block.bz - 1) + reserve
    const maxZ = seamCoord(park.block.bz) - reserve
    const paving = themeParkPaving()
    expect(paving.length).toBeGreaterThan(5)
    for (const p of paving) {
      expect(p.cx - p.halfW).toBeGreaterThan(minX - 1)
      expect(p.cx + p.halfW).toBeLessThan(maxX + 1)
      expect(p.cz - p.halfD).toBeGreaterThan(minZ - 1)
      expect(p.cz + p.halfD).toBeLessThan(maxZ + 1)
    }
  })

  it('leaves nothing else on its block', () => {
    expect(isThemeParkBlock(park.block)).toBe(true)
    for (const h of buildHouses()) expect(isThemeParkBlock(h.block)).toBe(false)
    for (const b of buildCityBuildings(layout, 'high')) {
      const plot = layout.plots.find((p) => `bld-${p.id}` === b.id)!
      expect(isThemeParkBlock(plot.block)).toBe(false)
    }
  })
})
