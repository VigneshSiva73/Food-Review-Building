import { describe, expect, it } from 'vitest'
import { islandConfig } from '@/config'
import { buildHeightField } from './heightField'
import { buildRivers } from './rivers'
import { buildWaterfalls } from './waterfalls'

const field = buildHeightField()
const rivers = buildRivers(field)
const falls = buildWaterfalls(rivers)

describe('buildWaterfalls', () => {
  it('finds some, but not one on every bend', () => {
    expect(falls.length).toBeGreaterThan(3)
    expect(falls.length).toBeLessThanOrEqual(islandConfig.waterfalls.maxCount)
  })

  it('never puts one on flat ground', () => {
    // §11's central rule, and it is guaranteed rather than checked for: a fall
    // exists only where the river it was found on was already dropping.
    for (const f of falls) {
      expect(`height ${f.height >= islandConfig.waterfalls.minHeight}`).toBe('height true')
      expect(`falls ${f.poolY < f.y}`).toBe('falls true')
    }
  })

  it('sits above the water, never under it', () => {
    for (const f of falls) {
      expect(`above sea ${f.poolY > islandConfig.world.seaLevel}`).toBe('above sea true')
    }
  })

  it('keeps the biggest when it caps the list', () => {
    for (let i = 1; i < falls.length; i++) {
      expect(`${falls[i].height <= falls[i - 1].height}`).toBe('true')
    }
  })

  it('has a heading, so the sheet can face across the flow', () => {
    for (const f of falls) {
      const len = Math.hypot(f.headingX, f.headingZ)
      expect(`unit ${Math.abs(len - 1) < 0.001}`).toBe('unit true')
    }
  })

  it('is stable between builds', () => {
    const again = buildWaterfalls(rivers)
    expect(again.length).toBe(falls.length)
    expect(again[0].height).toBe(falls[0].height)
  })
})
