import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { buildParking } from './parking'
import { buildCityBuildings, buildCityLayout, zoneAt } from '@/city'

const layout = buildCityLayout()
const lots = buildParking(layout)
const buildings = buildCityBuildings(layout, 'high')
const plots = new Map(layout.plots.map((p) => [`bld-${p.id}`, p]))

describe('buildParking', () => {
  it('is deterministic', () => {
    expect(buildParking(layout)).toEqual(lots)
  })

  it('parks some of the city, not all of it and not none', () => {
    // "Do not create giant empty parking lots everywhere" cuts both ways.
    expect(lots.length).toBeGreaterThan(20)
    expect(lots.length).toBeLessThan(buildings.length * 0.7)
  })

  it('never lays a lot over the building it serves', () => {
    for (const lot of lots) {
      const b = buildings.find((x) => `park-${x.id}` === lot.id)!
      const gapX = Math.abs(lot.cx - b.position.x) - lot.halfW - b.width / 2
      const gapZ = Math.abs(lot.cz - b.position.z) - lot.halfD - b.depth / 2
      // Clear on at least one axis, by the footway the config asks for.
      expect(Math.max(gapX, gapZ)).toBeGreaterThanOrEqual(cityConfig.parking.buildingGap - 1e-6)
    }
  })

  it('keeps every lot inside the plot it belongs to', () => {
    for (const lot of lots) {
      const plot = plots.get(lot.id.replace('park-', ''))!
      expect(Math.abs(lot.cx - plot.center.x) + lot.halfW).toBeLessThanOrEqual(plot.halfW + 1e-6)
      expect(Math.abs(lot.cz - plot.center.z) + lot.halfD).toBeLessThanOrEqual(plot.halfD + 1e-6)
    }
  })

  it('parks downtown least and the commercial strip most', () => {
    const rate = (zone: string) => {
      const inZone = buildings.filter((b) => zoneAt(plots.get(b.id)!.block) === zone)
      if (inZone.length === 0) return 0
      const ids = new Set(inZone.map((b) => `park-${b.id}`))
      return lots.filter((l) => ids.has(l.id)).length / inZone.length
    }
    expect(rate('commercial')).toBeGreaterThan(rate('core'))
  })
})
