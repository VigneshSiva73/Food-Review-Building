import { describe, expect, it } from 'vitest'
import { islandConfig } from '@/config'
import { buildHeightField, heightAt } from './heightField'
import { buildRocks } from './rocks'
import { slopeAt } from './vegetation'

const field = buildHeightField()
const rocks = buildRocks(field)

describe('buildRocks', () => {
  it('puts stone where soil does not stay, not everywhere', () => {
    expect(rocks.length).toBeGreaterThan(200)
    // §29 is explicit that they must not be evenly distributed. Every rock has
    // to have earned its place on one of the three counts — steep, washed, or
    // in the surf — so none should sit on flat, dry, inland ground.
    let bland = 0
    for (const r of rocks) {
      const i = Math.round((r.x + field.half) / field.step)
      const j = Math.round((r.z + field.half) / field.step)
      const cell = j * field.size + i
      const steep = slopeAt(field, r.x, r.z) > islandConfig.rocks.slopeFrom
      const washed = field.flow[cell] > 40
      const coastal = field.shoreDistance[cell] * field.step < islandConfig.rocks.shoreFar
      if (!steep && !washed && !coastal) bland++
    }
    expect(`bland ${bland}`).toBe('bland 0')
  })

  it('never drops one in the sea or in the city', () => {
    for (const r of rocks) {
      expect(`dry:${heightAt(field, r.x, r.z) > islandConfig.world.seaLevel}`).toBe('dry:true')
      const i = Math.round((r.x + field.half) / field.step)
      const j = Math.round((r.z + field.half) / field.step)
      expect(`outside city:${field.shelf[j * field.size + i] <= 0.02}`).toBe(
        'outside city:true',
      )
    }
  })

  it('sits every boulder on the ground', () => {
    for (const r of rocks) {
      expect(`grounded:${Math.abs(r.y - heightAt(field, r.x, r.z)) < 0.001}`).toBe(
        'grounded:true',
      )
    }
  })

  it('varies in size, and stays boulder-sized', () => {
    const radii = rocks.map((r) => r.radius)
    expect(new Set(radii.map((v) => v.toFixed(1))).size).toBeGreaterThan(20)
    expect(Math.max(...radii)).toBeLessThan(islandConfig.rocks.maxRadius * 1.4)
  })

  it('is stable between builds', () => {
    const again = buildRocks(field)
    expect(again.length).toBe(rocks.length)
    expect(again[0].x).toBe(rocks[0].x)
  })
})
