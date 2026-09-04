import { describe, expect, it } from 'vitest'
import { cityConfig, roadReserve } from '@/config'
import { buildFacilities, facilityAt } from './civic'
import { buildCityBuildings, buildCityLayout, buildHouses, onMajorRoad, seamCoord, zoneAt } from '@/city'
import type { CivicKind } from './types'

const facilities = buildFacilities()
const layout = buildCityLayout()

const of = (kind: CivicKind) => facilities.filter((f) => f.kind === kind)

describe('buildFacilities', () => {
  it('is deterministic', () => {
    expect(buildFacilities()).toEqual(facilities)
  })

  it('builds the set the brief asks for', () => {
    for (const [kind, spec] of Object.entries(cityConfig.civic.kinds)) {
      expect(`${kind}:${of(kind as CivicKind).length}`).toBe(`${kind}:${spec.count}`)
    }
  })

  it('puts the hospital and the shopping centre on a major road', () => {
    // "Connected directly to a major road", and explicitly not in the middle
    // of a residential street. This is the rule the whole placement exists for.
    for (const f of [...of('hospital'), ...of('shopping')]) {
      expect(`${f.id}:${onMajorRoad(f.block)}`).toBe(`${f.id}:true`)
    }
  })

  it('puts the schools among the houses, off the arterials where it can', () => {
    for (const f of of('school')) {
      expect(['residential', 'suburban']).toContain(zoneAt(f.block))
    }
    const quiet = of('school').filter((f) => !onMajorRoad(f.block)).length
    expect(quiet).toBeGreaterThan(of('school').length / 2)
  })

  it('keeps facilities of a kind apart, so each neighbourhood gets one', () => {
    for (const [kind, spec] of Object.entries(cityConfig.civic.kinds)) {
      const list = of(kind as CivicKind)
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].building?.position ?? list[i].greens[0]
          const b = list[j].building?.position ?? list[j].greens[0]
          const ax = 'x' in a ? a.x : a.cx
          const az = 'z' in a ? a.z : a.cz
          const bx = 'x' in b ? b.x : b.cx
          const bz = 'z' in b ? b.z : b.cz
          expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(spec.spacing * 0.5)
        }
      }
    }
  })

  it('keeps every part of a facility inside its own block', () => {
    const reserve = roadReserve(true)
    for (const f of facilities) {
      const minX = seamCoord(f.block.bx - 1) + reserve
      const maxX = seamCoord(f.block.bx) - reserve
      const minZ = seamCoord(f.block.bz - 1) + reserve
      const maxZ = seamCoord(f.block.bz) - reserve
      const rects = [
        ...f.aprons,
        ...f.greens,
        ...(f.building
          ? [
              {
                cx: f.building.position.x,
                cz: f.building.position.z,
                halfW: f.building.width / 2,
                halfD: f.building.depth / 2,
              },
            ]
          : []),
      ]
      for (const r of rects) {
        expect(r.cx - r.halfW).toBeGreaterThanOrEqual(minX - 1)
        expect(r.cx + r.halfW).toBeLessThanOrEqual(maxX + 1)
        expect(r.cz - r.halfD).toBeGreaterThanOrEqual(minZ - 1)
        expect(r.cz + r.halfD).toBeLessThanOrEqual(maxZ + 1)
      }
    }
  })

  it('leaves nothing else on a claimed block', () => {
    // A facility owns its block outright — no houses along the edge, no plot
    // building through the middle of the car park.
    for (const h of buildHouses()) expect(facilityAt(h.block)).toBeNull()
    for (const b of buildCityBuildings(layout, 'high')) {
      const plot = layout.plots.find((p) => `bld-${p.id}` === b.id)!
      expect(facilityAt(plot.block)).toBeNull()
    }
  })

  it('gives a school a field and a shopping centre a car park', () => {
    for (const f of of('school')) {
      expect(f.greens.length).toBeGreaterThan(0)
      expect(f.building).not.toBeNull()
      expect(f.building!.floors).toBeLessThanOrEqual(3)
    }
    for (const f of of('shopping')) expect(f.aprons.length).toBeGreaterThan(0)
    for (const f of of('sports')) expect(f.building).toBeNull()
  })
})
