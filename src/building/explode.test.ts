import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildingConfig } from '@/config'
import { runPipeline } from '@/data/pipeline'
import { applyExplode } from './explode'
import { buildLayout } from './layoutSolver'

const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
const layout = buildLayout(runPipeline(csvText).days)

describe('applyExplode', () => {
  it('returns the original objects at offset 0 (memo stability)', () => {
    const result = applyExplode(layout, 0)
    expect(result.floors).toBe(layout.floors)
    expect(result.totalHeight).toBe(layout.totalHeight)
  })

  it('shifts floor i by exactly i × offset, everywhere', () => {
    const offset = buildingConfig.explodeGap
    const result = applyExplode(layout, offset)
    result.floors.forEach((f, i) => {
      const original = layout.floors[i]
      const dy = i * offset
      expect(f.baseY).toBeCloseTo(original.baseY + dy)
      expect(f.deckY).toBeCloseTo(original.deckY + dy)
      f.pillars.forEach((p, k) => {
        expect(p.base.y).toBeCloseTo(original.pillars[k].base.y + dy)
        expect(p.height).toBe(original.pillars[k].height) // heights untouched
      })
      f.slab.corners.forEach((c, k) => {
        expect(c.y).toBeCloseTo(original.slab.corners[k].y + dy)
        expect(c.x).toBe(original.slab.corners[k].x)
      })
    })
  })

  it('widens every floor gap by exactly the offset and keeps bands between neighbours', () => {
    const offset = buildingConfig.explodeGap
    const result = applyExplode(layout, offset)
    for (let i = 1; i < result.floors.length; i++) {
      const newGap = result.floors[i].baseY - result.floors[i - 1].baseY
      const oldGap = layout.floors[i].baseY - layout.floors[i - 1].baseY
      expect(newGap).toBeCloseTo(oldGap + offset)
      expect(result.floors[i].baseY).toBeGreaterThan(result.floors[i - 1].deckY)
    }
  })

  it('does not mutate the source layout and preserves metadata', () => {
    const before = JSON.stringify(layout.floors[10])
    const result = applyExplode(layout, 3)
    expect(JSON.stringify(layout.floors[10])).toBe(before)
    expect(result.floors[10].pillars[1].meta).toEqual(layout.floors[10].pillars[1].meta)
    expect(result.totalHeight).toBeCloseTo(layout.totalHeight + (layout.floors.length - 1) * 3)
  })
})
