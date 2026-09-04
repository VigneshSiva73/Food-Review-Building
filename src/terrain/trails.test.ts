import { describe, expect, it } from 'vitest'
import { islandConfig } from '@/config'
import { buildHeightField } from './heightField'
import { buildRivers } from './rivers'
import { buildRoads } from './roads'
import { buildSettlements } from './settlements'
import { buildTrails, trailheads } from './trails'
import { buildWaterfalls } from './waterfalls'

const field = buildHeightField()
const roads = buildRoads(field, buildSettlements(field))
const falls = buildWaterfalls(buildRivers(field))
const heads = trailheads(field, falls)
const trails = buildTrails(field, roads, falls)

const gradesOf = (paths: typeof trails) => {
  const out: number[] = []
  for (const p of paths) {
    for (let i = 1; i < p.length; i++) {
      const run = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z) || 1
      out.push(Math.abs(p[i].y - p[i - 1].y) / run)
    }
  }
  return out.sort((a, b) => b - a)
}

describe('trailheads', () => {
  it('goes to all three kinds of place', () => {
    const kinds = new Set(heads.map((h) => h.kind))
    expect(kinds.has('waterfall')).toBe(true)
    expect(kinds.has('beach')).toBe(true)
    expect(kinds.has('viewpoint')).toBe(true)
  })

  it('spreads the viewpoints rather than crowding one summit', () => {
    // The highest ground on the island is ONE place; a trail network needs
    // several, so candidates are kept apart.
    const views = heads.filter((h) => h.kind === 'viewpoint')
    for (let i = 0; i < views.length; i++) {
      for (let j = i + 1; j < views.length; j++) {
        const d = Math.hypot(views[i].x - views[j].x, views[i].z - views[j].z)
        expect(`${i},${j}:${d >= islandConfig.trails.viewpointSpacing - 0.01}`).toBe(
          `${i},${j}:true`,
        )
      }
    }
  })
})

describe('buildTrails', () => {
  it('reaches a good share of them', () => {
    expect(trails.length).toBeGreaterThan(6)
  })

  it('climbs where a road would have to switchback', () => {
    // The whole character of a footpath, and the reason it is worth having a
    // separate weight rather than reusing the road's: a walker goes up.
    const trailMedian = gradesOf(trails)[Math.floor(gradesOf(trails).length / 2)]
    const roadMedian = gradesOf(roads)[Math.floor(gradesOf(roads).length / 2)]
    expect(trailMedian).toBeGreaterThan(roadMedian * 2)
    // But still a path, not a climbing route.
    expect(gradesOf(trails)[0]).toBeLessThan(0.9)
  })

  it('never runs into the sea', () => {
    for (const trail of trails) {
      for (const p of trail) {
        expect(`dry:${p.y > islandConfig.world.seaLevel}`).toBe('dry:true')
      }
    }
  })

  it('starts from a road, not from the city', () => {
    // Seeded with every road node at once, so each path leaves the road nearest
    // it — which is what a trailhead is. The last point of a trace is a seed.
    const stride = islandConfig.roads.stride
    const size = Math.floor(field.size / stride)
    const step = field.step * stride
    const nodes = new Set<number>()
    for (const road of roads) {
      for (const p of road) {
        const i = Math.min(size - 1, Math.max(0, Math.round((p.x + field.half) / step)))
        const j = Math.min(size - 1, Math.max(0, Math.round((p.z + field.half) / step)))
        nodes.add(j * size + i)
      }
    }
    for (const trail of trails) {
      const end = trail[trail.length - 1]
      const i = Math.min(size - 1, Math.max(0, Math.round((end.x + field.half) / step)))
      const j = Math.min(size - 1, Math.max(0, Math.round((end.z + field.half) / step)))
      expect(`on a road:${nodes.has(j * size + i)}`).toBe('on a road:true')
    }
  })

  it('is stable between builds', () => {
    const again = buildTrails(field, roads, falls)
    expect(again.length).toBe(trails.length)
  })
})
