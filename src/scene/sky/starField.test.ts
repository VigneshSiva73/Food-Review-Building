import { describe, expect, it } from 'vitest'
import { computeQualityTier } from '@/utils/quality'
import { buildStarField } from './starField'

const field = buildStarField(1500)

describe('buildStarField', () => {
  it('is byte-identical between builds', () => {
    // The field is rebuilt whenever the component remounts. Anything random
    // here and the stars would jump to new places every time, which is far more
    // obvious than it sounds — the eye tracks a constellation it has seen once.
    const again = buildStarField(1500)
    expect(Array.from(again.positions)).toEqual(Array.from(field.positions))
    expect(Array.from(again.sizes)).toEqual(Array.from(field.sizes))
    expect(Array.from(again.brightness)).toEqual(Array.from(field.brightness))
  })

  it('fills every attribute for every star', () => {
    for (const [name, arr, per] of [
      ['positions', field.positions, 3],
      ['sizes', field.sizes, 1],
      ['brightness', field.brightness, 1],
      ['phases', field.phases, 1],
      ['frequencies', field.frequencies, 1],
      ['amplitudes', field.amplitudes, 1],
    ] as const) {
      expect(`${name}:${arr.length}`).toBe(`${name}:${field.count * per}`)
      expect(`${name} finite:${arr.every((v) => Number.isFinite(v))}`).toBe(`${name} finite:true`)
    }
  })

  it('puts every star on the unit sphere, above the horizon', () => {
    // Unit length because the shader treats these as directions and pins them
    // to the far plane — a non-unit position would land a star at the wrong
    // angle rather than at the wrong distance.
    let offSphere = 0
    let belowHorizon = 0
    for (let i = 0; i < field.count; i++) {
      const x = field.positions[i * 3]
      const y = field.positions[i * 3 + 1]
      const z = field.positions[i * 3 + 2]
      if (Math.abs(Math.hypot(x, y, z) - 1) > 1e-5) offSphere++
      if (y <= 0) belowHorizon++
    }
    expect(`off-sphere ${offSphere}, below horizon ${belowHorizon}`).toBe(
      'off-sphere 0, below horizon 0',
    )
  })

  it('spreads evenly rather than crowding the zenith', () => {
    // The trap this avoids: sampling an elevation ANGLE uniformly packs stars
    // around the pole, which reads as a bright patch directly overhead and is
    // the classic tell of a generated sky. Sampling height uniformly is what
    // makes the density even, so equal bands of height hold equal counts.
    const bands = [0, 0, 0, 0]
    for (let i = 0; i < field.count; i++) {
      const y = field.positions[i * 3 + 1]
      bands[Math.min(3, Math.floor(y * 4))]++
    }
    const expected = field.count / 4
    for (const [i, n] of bands.entries()) {
      expect(`band ${i} within 25%:${Math.abs(n - expected) < expected * 0.25}`).toBe(
        `band ${i} within 25%:true`,
      )
    }
  })

  it('keeps stars small and mostly faint', () => {
    // Big bright dots read as glowing particles floating near the camera, not
    // as a distant sky.
    expect(Math.max(...field.sizes)).toBeLessThanOrEqual(3.5)
    expect(Math.min(...field.sizes)).toBeGreaterThan(0)
    const median = [...field.brightness].sort((a, b) => a - b)[Math.floor(field.count / 2)]
    expect(median).toBeLessThan(0.55)
    // A scattering of stand-outs is what the eye reads the sky by.
    const big = field.sizes.filter((s) => s > 2.5).length / field.count
    expect(big).toBeGreaterThan(0.005)
    expect(big).toBeLessThan(0.08)
  })

  it('twinkles gently, and never in unison', () => {
    // A shared phase would make the whole sky pulse as one, which reads as a
    // fault rather than as atmosphere.
    expect(Math.max(...field.amplitudes)).toBeLessThanOrEqual(0.35)
    const median = [...field.amplitudes].sort((a, b) => a - b)[Math.floor(field.count / 2)]
    expect(median).toBeLessThan(0.15)
    expect(new Set(Array.from(field.phases)).size).toBeGreaterThan(field.count * 0.9)
  })

  it('scales to the device, without changing the draw count', () => {
    // One `THREE.Points` either way — the tier buys fill cost, not draw calls.
    const desktop = computeQualityTier(1600, false)
    const mobile = computeQualityTier(390, true)
    expect(mobile.stars).toBeLessThan(desktop.stars)
    expect(mobile.stars).toBeGreaterThan(0)
    expect(buildStarField(mobile.stars).count).toBe(mobile.stars)
  })
})
