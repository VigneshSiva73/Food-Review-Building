import { describe, expect, it } from 'vitest'
import { islandConfig } from '@/config'
import { buildHeightField } from './heightField'
import { buildRoads, smoothRoad } from './roads'
import { buildSettlements } from './settlements'

const field = buildHeightField()
const places = buildSettlements(field)
const roads = buildRoads(field, places)

const grades = (() => {
  const out: number[] = []
  for (const r of roads) {
    for (let i = 1; i < r.length; i++) {
      const run = Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) || 1
      out.push(Math.abs(r[i].y - r[i - 1].y) / run)
    }
  }
  return out.sort((a, b) => b - a)
})()

describe('buildRoads', () => {
  it('reaches most of the settlements', () => {
    expect(roads.length).toBeGreaterThan(places.length * 0.6)
  })

  it('follows the terrain instead of climbing over it', () => {
    // §22, and the single number that says whether the whole approach worked.
    // Cost is distance times the square of the gradient, so a road would rather
    // go a long way round than up a face — and squaring is what turns "would
    // rather" into a switchback when there is no way round.
    const median = grades[Math.floor(grades.length / 2)]
    expect(median).toBeLessThan(0.08)
    // Nothing anywhere on the island climbs like a staircase.
    expect(grades[0]).toBeLessThan(0.45)
  })

  it('merges into trunks rather than fanning out from the city', () => {
    // A spoke per settlement would be a star centred on the tower, which is the
    // shape this island exists to avoid. Sharing an existing road is cheap, so
    // the chains coincide and the busiest segments carry many places at once.
    const busiest = Math.max(...roads.flat().map((p) => p.traffic))
    expect(busiest).toBeGreaterThan(3)
  })

  it('never runs through the sea', () => {
    for (const road of roads) {
      for (const p of road) {
        expect(`dry:${p.y > islandConfig.world.seaLevel}`).toBe('dry:true')
      }
    }
  })

  it('ends at the city', () => {
    // Every chain is walked back along the predecessor tree, which is rooted in
    // the city — so the last point of each road has to be on its shelf.
    const s = field.size
    for (const road of roads) {
      const end = road[road.length - 1]
      const i = Math.round((end.x + field.half) / field.step)
      const j = Math.round((end.z + field.half) / field.step)
      expect(`connected:${field.shelf[j * s + i] >= 0.9}`).toBe('connected:true')
    }
  })

  it('is stable between builds', () => {
    const again = buildRoads(field, places)
    expect(again.length).toBe(roads.length)
    expect(again[0][0].x).toBe(roads[0][0].x)
  })
})

describe('smoothRoad', () => {
  it('rounds the lattice staircase off without moving the route', () => {
    // The search steps in eight directions only, which shows as kinks on any
    // diagonal. Smoothing must take those out without wandering off the line
    // the terrain chose.
    const road = roads.find((r) => r.length > 12)!
    const smooth = smoothRoad(road)
    expect(smooth.length).toBeGreaterThan(road.length)
    const drift = Math.hypot(smooth[0].x - road[0].x, smooth[0].z - road[0].z)
    expect(drift).toBeLessThan(1)

    const turn = (r: typeof road, i: number) => {
      const a = Math.atan2(r[i].z - r[i - 1].z, r[i].x - r[i - 1].x)
      const b = Math.atan2(r[i + 1].z - r[i].z, r[i + 1].x - r[i].x)
      return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)))
    }
    const sharpest = (r: typeof road) => {
      let worst = 0
      for (let i = 1; i < r.length - 1; i++) worst = Math.max(worst, turn(r, i))
      return worst
    }
    expect(sharpest(smooth)).toBeLessThan(sharpest(road))
  })
})
