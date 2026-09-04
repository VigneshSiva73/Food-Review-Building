import { describe, expect, it } from 'vitest'
import { animationConfig } from '@/config'
import { buildPrefix } from '@/scene/construction'
import {
  buildTimeline,
  easeOutCubic,
  floorProgress,
  revealedFloorCount,
} from './timeline'

const PER_FLOOR = animationConfig.pillarGrowMs + animationConfig.slabAppearMs + animationConfig.mullionAppearMs

describe('buildTimeline', () => {
  it('uses the configured stagger when the sequence fits the budget', () => {
    const t = buildTimeline(65)
    expect(t.staggerMs).toBe(animationConfig.floorStaggerMs)
    expect(t.perFloorMs).toBe(PER_FLOOR)
    expect(t.totalMs).toBe(64 * animationConfig.floorStaggerMs + PER_FLOOR)
    expect(t.totalMs).toBeLessThanOrEqual(animationConfig.maxTotalMs)
  })

  it('shrinks the stagger so any dataset size stays within the budget', () => {
    for (const count of [150, 300, 1000, 2000]) {
      const t = buildTimeline(count)
      expect(t.totalMs).toBeLessThanOrEqual(animationConfig.maxTotalMs + 1e-9)
      expect(t.staggerMs).toBeGreaterThan(0)
      expect(t.staggerMs).toBeLessThan(animationConfig.floorStaggerMs)
    }
  })

  it('handles the degenerate one-floor and empty cases', () => {
    expect(buildTimeline(1)).toMatchObject({ staggerMs: 0, totalMs: PER_FLOOR })
    expect(buildTimeline(0)).toMatchObject({ floorCount: 0, totalMs: 0 })
  })
})

describe('floorProgress', () => {
  const t = buildTimeline(10)

  it('runs pillar → slab → detail in order for a floor', () => {
    expect(floorProgress(t, 0, 0)).toEqual({ pillar: 0, slab: 0, detail: 0 })
    const mid = floorProgress(t, 0, animationConfig.pillarGrowMs / 2)
    expect(mid.pillar).toBeCloseTo(0.5)
    expect(mid.slab).toBe(0)
    const afterPillars = floorProgress(t, 0, animationConfig.pillarGrowMs + 1)
    expect(afterPillars.pillar).toBe(1)
    expect(afterPillars.slab).toBeGreaterThan(0)
    expect(afterPillars.detail).toBe(0)
  })

  it('delays each floor by its stagger', () => {
    const at = 5 * t.staggerMs + animationConfig.pillarGrowMs / 2
    const here = floorProgress(t, 5, at).pillar
    expect(here).toBeCloseTo(0.5)
    // Floors overlap by design (stagger < grow duration): earlier floors always lead.
    expect(floorProgress(t, 4, at).pillar).toBeGreaterThan(here)
    expect(floorProgress(t, 6, at).pillar).toBeLessThan(here)
    // A floor whose start time has not yet arrived is untouched.
    expect(floorProgress(t, 9, at).pillar).toBe(0)
  })

  it('has every floor fully built at totalMs', () => {
    for (let i = 0; i < t.floorCount; i++) {
      expect(floorProgress(t, i, t.totalMs)).toEqual({ pillar: 1, slab: 1, detail: 1 })
    }
  })
})

describe('revealedFloorCount', () => {
  const t = buildTimeline(20)

  it('grows monotonically and reveals a prefix of floors', () => {
    let previous = 0
    for (let ms = 0; ms <= t.totalMs; ms += 50) {
      const n = revealedFloorCount(t, 'pillar', ms)
      expect(n).toBeGreaterThanOrEqual(previous)
      expect(n).toBeLessThanOrEqual(t.floorCount)
      previous = n
    }
    expect(previous).toBe(t.floorCount)
  })

  it('never reveals a later phase before an earlier one', () => {
    for (let ms = 0; ms <= t.totalMs; ms += 37) {
      const pillar = revealedFloorCount(t, 'pillar', ms)
      const slab = revealedFloorCount(t, 'slab', ms)
      const detail = revealedFloorCount(t, 'detail', ms)
      expect(slab).toBeLessThanOrEqual(pillar)
      expect(detail).toBeLessThanOrEqual(slab)
    }
  })
})

describe('easeOutCubic', () => {
  it('maps the unit interval with a fast start and gentle settle', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })
})

describe('buildPrefix', () => {
  it('counts instances belonging to floors below each index', () => {
    // Three instances on floor 0, two on floor 1, none on floor 2, one on floor 3.
    const prefix = buildPrefix([0, 0, 0, 1, 1, 3], 4)
    expect(prefix).toEqual([0, 3, 5, 5, 6])
  })

  it('is all zeros for an empty instance list', () => {
    expect(buildPrefix([], 3)).toEqual([0, 0, 0, 0])
  })
})
