import { describe, expect, it } from 'vitest'
import { cityConfig, moduleHeight } from '@/config'
import { buildCityBuildings, buildSkyline, createCityBuilding } from './cityBuildings'
import { buildCityLayout } from './cityLayout'
import type { Zone } from './types'

const layout = buildCityLayout()
const buildings = buildCityBuildings(layout, 'high')

/** Approximate hero height for the shipped dataset: one module per day-floor. */
const HERO_HEIGHT = 65 * moduleHeight()

describe('buildCityBuildings', () => {
  it('is deterministic across rebuilds', () => {
    expect(buildCityBuildings(layout, 'high')).toEqual(buildCityBuildings(layout, 'high'))
    expect(buildSkyline('high')).toEqual(buildSkyline('high'))
  })

  it('never lets a neighbour rival the hero', () => {
    // The single most important constraint in the whole environment: the
    // building is the data, the city is context. If a neighbour ever
    // approaches the tower's height the composition inverts.
    for (const b of buildings) {
      expect(b.height).toBeLessThan(HERO_HEIGHT * 0.4)
    }
    for (const mass of buildSkyline('high')) {
      expect(mass.height).toBeLessThan(HERO_HEIGHT * 0.7)
    }
  })

  it('keeps every building inside its own plot', () => {
    const byId = new Map(layout.plots.map((p) => [`bld-${p.id}`, p]))
    for (const b of buildings) {
      const plot = byId.get(b.id)
      expect(plot).toBeDefined()
      expect(b.width).toBeLessThanOrEqual(plot!.halfW * 2 + 1e-9)
      expect(b.depth).toBeLessThanOrEqual(plot!.halfD * 2 + 1e-9)
      expect(b.position).toEqual(plot!.center)
    }
  })

  it('steps down through the zoning bands, tallest at the centre', () => {
    // The height ladder is now per ZONE, not per ring — the ring only knows
    // "inner" and "mid", which cannot express a downtown, a commercial strip,
    // suburbs and everything between.
    const tallest = new Map<Zone, number>()
    for (const b of buildings) {
      tallest.set(b.zone, Math.max(tallest.get(b.zone) ?? 0, b.floors))
    }
    const order: Zone[] = ['core', 'commercial', 'mixed', 'residential', 'suburban']
    for (let i = 1; i < order.length; i++) {
      expect(`${order[i]}:${(tallest.get(order[i]) ?? 0) < (tallest.get(order[i - 1]) ?? 0)}`).toBe(
        `${order[i]}:true`,
      )
    }
    // Nothing is ever built on green space or on a parcel nobody has taken.
    expect(buildings.some((b) => b.zone === 'park' || b.zone === 'undeveloped')).toBe(false)
  })

  it('produces genuine variety rather than one repeated box', () => {
    const types = new Set(buildings.map((b) => b.type))
    expect(types.size).toBeGreaterThanOrEqual(4)

    // Measured on the whole building rather than on its height alone. Heights
    // are whole storeys now, as a real building's is, so a tower of 40 floors
    // and its neighbour of 40 floors legitimately share a height — what has to
    // differ is the footprint they stand on and the type they are.
    const shapes = new Set(
      buildings.map((b) => `${b.type}:${b.floors}:${Math.round(b.width)}x${Math.round(b.depth)}`),
    )
    expect(shapes.size).toBeGreaterThan(buildings.length * 0.9)

    // And no single storey count may dominate the skyline.
    const byFloors = new Map<number, number>()
    for (const b of buildings) byFloors.set(b.floors, (byFloors.get(b.floors) ?? 0) + 1)
    expect(Math.max(...byFloors.values())).toBeLessThan(buildings.length * 0.25)
  })

  it('derives a sensible floor count and keeps yaw subtle', () => {
    const maxYaw = (cityConfig.buildings.maxRotationDeg * Math.PI) / 180
    for (const b of buildings) {
      expect(b.floors).toBeGreaterThanOrEqual(1)
      expect(b.floors).toBe(Math.round(b.height / cityConfig.buildings.storeyHeight))
      expect(Math.abs(b.rotationY)).toBeLessThanOrEqual(maxYaw)
      expect(b.variant).toBeGreaterThanOrEqual(0)
      expect(b.variant).toBeLessThan(1)
    }
  })

  it('thins the whole city when density drops, rather than cropping its edge', () => {
    const high = buildCityBuildings(layout, 'high')
    const low = buildCityBuildings(layout, 'low')
    expect(low.length).toBeLessThan(high.length)

    // A subset, always: dropping the tier may only remove buildings.
    const lowIds = new Set(low.map((b) => b.id))
    expect(high.filter((b) => lowIds.has(b.id))).toHaveLength(low.length)

    // And it thins everywhere. Cropping by distance drew a hard circle of city
    // around the tower, which is the concentric result this city exists to
    // avoid; the far half has to lose roughly the share the near half does.
    const far = (list: typeof high) =>
      list.filter((b) => Math.hypot(b.position.x, b.position.z) > 1200).length
    const nearOf = (list: typeof high) => list.length - far(list)
    const farRatio = far(low) / far(high)
    const nearRatio = nearOf(low) / nearOf(high)
    expect(Math.abs(farRatio - nearRatio)).toBeLessThan(0.15)
  })

  it('generates one building per plot, with unique ids', () => {
    const ids = new Set(buildings.map((b) => b.id))
    expect(ids.size).toBe(buildings.length)
  })

  it('createCityBuilding is stable for a given plot', () => {
    const plot = layout.plots[0]
    expect(createCityBuilding(plot)).toEqual(createCityBuilding(plot))
  })
})

describe('buildSkyline', () => {
  it('sits in the configured annulus, outside the modelled grid', () => {
    for (const mass of buildSkyline('high')) {
      const r = Math.hypot(mass.position.x, mass.position.z)
      expect(r).toBeGreaterThanOrEqual(cityConfig.skyline.innerRadius - 1e-9)
      expect(r).toBeLessThanOrEqual(cityConfig.skyline.outerRadius + 1e-9)
      // Inside the ground disc, so the horizon never shows masses afloat.
      expect(r).toBeLessThan(cityConfig.groundRadius)
    }
  })

  it('scales its count with the density preset', () => {
    expect(buildSkyline('low')).toHaveLength(cityConfig.density.low.skyline)
    expect(buildSkyline('high')).toHaveLength(cityConfig.density.high.skyline)
  })
})
