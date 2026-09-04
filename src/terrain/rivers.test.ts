import { describe, expect, it } from 'vitest'
import { islandConfig } from '@/config'
import { buildHeightField } from './heightField'
import { buildRivers } from './rivers'

const field = buildHeightField()
const rivers = buildRivers(field)

describe('buildRivers', () => {
  it('finds a network rather than a handful of lines', () => {
    expect(rivers.length).toBeGreaterThan(40)
    const points = rivers.reduce((a, r) => a + r.length, 0)
    expect(points).toBeGreaterThan(600)
  })

  it('only ever runs downhill', () => {
    // Water that climbs is the tell that the trace stopped following the same
    // rule the flow was accumulated by, and the courses would no longer agree
    // with the valleys that were cut for them.
    for (const river of rivers) {
      for (let i = 1; i < river.length; i++) {
        expect(`${river[i].y <= river[i - 1].y + 0.001}`).toBe('true')
      }
    }
  })

  it('widens downstream, never narrows', () => {
    // §9's hierarchy. Width comes from accumulated flow, which can only grow as
    // tributaries join, so a narrowing river means width and flow have come
    // apart somewhere.
    for (const river of rivers) {
      for (let i = 1; i < river.length; i++) {
        expect(`${river[i].halfWidth >= river[i - 1].halfWidth - 0.001}`).toBe('true')
      }
    }
  })

  it('never runs through the city', () => {
    // The city's ground is flat and built on. A river crossing it would come
    // out as water lying across the streets.
    const s = field.size
    for (const river of rivers) {
      for (const p of river) {
        const i = Math.round((p.x + field.half) / field.step)
        const j = Math.round((p.z + field.half) / field.step)
        expect(`shelf ${field.shelf[j * s + i] <= 0.02}`).toBe('shelf true')
      }
    }
  })

  it('leaves steep sections for waterfalls to be built on', () => {
    const steep = rivers.flat().filter((p) => p.drop > 8)
    expect(steep.length).toBeGreaterThan(50)
  })

  it('is stable between builds', () => {
    const again = buildRivers(field)
    expect(again.length).toBe(rivers.length)
    expect(again[0][0].x).toBe(rivers[0][0].x)
  })

  it('stays well inside its own budget', () => {
    // Rivers are one merged ribbon; this is what keeps it that way.
    const quads = rivers.reduce((a, r) => a + Math.max(0, r.length - 1), 0)
    expect(quads * 2).toBeLessThan(12_000)
    expect(islandConfig.rivers.minWidth).toBeLessThan(islandConfig.rivers.maxWidth)
  })
})
