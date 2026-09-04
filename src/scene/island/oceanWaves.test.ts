import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { islandConfig } from '@/config'
import { buildHeightField } from '@/terrain/heightField'
import { buildOceanMeshes } from './oceanMesh'
import {
  applyOceanWaves,
  OCEAN_SPECTRUM,
  WAVE_DISPLACE,
  WAVE_VERTEX,
} from './oceanWaves'

const field = buildHeightField()
const ocean = buildOceanMeshes(field, 96, 40_000)

describe('the ocean sheet', () => {
  it('carries a wave mask on every vertex', () => {
    const mask = ocean.shallow.getAttribute('waveMask')
    expect(mask).toBeDefined()
    expect(mask.count).toBe(ocean.shallow.getAttribute('position').count)
    for (let i = 0; i < mask.count; i++) {
      expect(mask.getX(i)).toBeGreaterThanOrEqual(0)
      expect(mask.getX(i)).toBeLessThanOrEqual(1)
    }
  })

  it('holds the swell down at the waterline and at the sheet edge', () => {
    // Both are tears waiting to happen: water a hand deep heaving two metres
    // lifts the sheet off the sand, and swell at the boundary pulls the sheet
    // away from the flat horizon plane it is supposed to dissolve into.
    const pos = ocean.shallow.getAttribute('position')
    const mask = ocean.shallow.getAttribute('waveMask')
    const sea = islandConfig.world.seaLevel
    let shoreMax = 0
    let edgeMax = 0
    for (let i = 0; i < mask.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const depth = sea - field.height[
        Math.min(field.size - 1, Math.max(0, Math.round((z + field.half) / field.step))) * field.size +
        Math.min(field.size - 1, Math.max(0, Math.round((x + field.half) / field.step)))
      ]
      if (depth < 6) shoreMax = Math.max(shoreMax, mask.getX(i))
      if (Math.max(Math.abs(x), Math.abs(z)) / field.half > 0.97) {
        edgeMax = Math.max(edgeMax, mask.getX(i))
      }
    }
    // Not exactly zero: the mask is a smoothstep and this samples the height
    // field at the nearest cell where the mesh interpolated it, so the two
    // disagree by a fraction of a cell at the boundary. What matters is that
    // the lift is negligible — a thousandth of the mask is 3mm of water.
    expect(shoreMax).toBeLessThan(0.001)
    expect(edgeMax).toBeLessThan(0.001)
  })

  it('lets the open shallows heave', () => {
    const mask = ocean.shallow.getAttribute('waveMask')
    let full = 0
    for (let i = 0; i < mask.count; i++) if (mask.getX(i) > 0.9) full++
    expect(full).toBeGreaterThan(50)
  })
})

describe('applyOceanWaves', () => {
  it('starts the clock away from zero, so a frozen sea is not flat', () => {
    // Every wave is at its zero crossing at t = 0, which is a flat sheet — and
    // the world genuinely does sit frozen whenever traffic and pedestrians are
    // both off.
    const uniforms = applyOceanWaves(new THREE.MeshStandardMaterial())
    expect(uniforms.uTime.value).toBeGreaterThan(0)
    expect(uniforms.uAmplitude.value).toBe(islandConfig.ocean.amplitude)
    expect(uniforms.uChoppiness.value).toBe(islandConfig.ocean.choppiness)
  })

  it('displaces in the vertex stage and shades the chop in the fragment stage', () => {
    // Both stages, deliberately. Anything shorter than a triangle cannot be
    // interpolated from the corners, so the short components have to be
    // evaluated per fragment or they alias instead of adding detail.
    const material = new THREE.MeshStandardMaterial()
    applyOceanWaves(material)
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader:
        '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <normal_fragment_maps>',
    }
    material.onBeforeCompile!(shader as never, null as never)

    expect(shader.vertexShader).toContain('waveMask')
    expect(shader.vertexShader).toContain('transformed.y +=')
    // The Gerstner shuffle: without this the crests are sine crests.
    expect(shader.vertexShader).toContain('transformed.xz +=')
    expect(shader.vertexShader).toContain('objectNormal = normalize')

    expect(shader.fragmentShader).toContain('oceanChopSlope')
    // After the maps, so the ripple map survives underneath it.
    const maps = shader.fragmentShader.indexOf('#include <normal_fragment_maps>')
    expect(shader.fragmentShader.indexOf('vec2 chop = oceanChopSlope')).toBeGreaterThan(maps)
    expect(shader.uniforms.uTime).toBeDefined()
  })

  it('gives every component the speed the water would', () => {
    // Deep-water dispersion, w = sqrt(g k), in both stages. The version before
    // this gave each component a made-up speed and made the SHORT ones the
    // fastest, which is backwards — the long swell outruns the chop.
    const material = new THREE.MeshStandardMaterial()
    applyOceanWaves(material)
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader:
        '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <normal_fragment_maps>',
    }
    material.onBeforeCompile!(shader as never, null as never)
    expect(shader.vertexShader).toContain('sqrt(GRAVITY * k)')
    expect(shader.fragmentShader).toContain('sqrt(GRAVITY * k)')
  })
})

describe('the wave spectrum', () => {
  const k = (w: (typeof OCEAN_SPECTRUM)[number]) => (Math.PI * 2) / w.wavelength

  it('runs long to short', () => {
    for (let i = 1; i < OCEAN_SPECTRUM.length; i++) {
      expect(OCEAN_SPECTRUM[i].wavelength).toBeLessThan(OCEAN_SPECTRUM[i - 1].wavelength)
      // Energy falls toward the short end, which is what a spectrum does.
      expect(OCEAN_SPECTRUM[i].steepness).toBeLessThan(OCEAN_SPECTRUM[i - 1].steepness)
    }
  })

  it('keeps every component below the breaking limit', () => {
    // Water breaks at H/L = 1/7, so A·k = pi/7. Past it a component is not a
    // wave any more.
    for (const w of OCEAN_SPECTRUM) expect(w.steepness).toBeLessThan(Math.PI / 7)
  })

  it('cannot fold a crest over itself', () => {
    // Gerstner's horizontal shuffle loops the surface through itself once the
    // summed steepness of the DISPLACED components, times the choppiness,
    // reaches 1. Only those components move the mesh, so only they can fold.
    const displaced = OCEAN_SPECTRUM.slice(0, WAVE_DISPLACE)
    const summed = displaced.reduce((sum, w) => sum + w.steepness, 0)
    expect(summed * islandConfig.ocean.choppiness).toBeLessThan(1)
  })

  it('splits the stages where the mesh can no longer carry a wave', () => {
    // The sheet's own resolution decides this, so it is computed rather than
    // asserted as a number: a component shaded from vertices further apart
    // than half its wavelength is being sampled below Nyquist. Measured on the
    // COARSE tier, because that one has to be right too.
    const step = (field.half * 2) / (96 - 1)
    // Anything the corners cannot carry has to be in the fragment set. The
    // reverse is not required — a long wave is perfectly happy being shaded
    // per fragment, it just cannot MOVE the mesh from there.
    OCEAN_SPECTRUM.forEach((w, i) => {
      if (w.wavelength < step * 2) expect(i).toBeGreaterThanOrEqual(WAVE_VERTEX)
    })
    // Four vertices to a period is the least that reads as a shape, and the
    // components that move the mesh have to read as shapes.
    for (let i = 0; i < WAVE_DISPLACE; i++) {
      expect(OCEAN_SPECTRUM[i].wavelength).toBeGreaterThan(step * 4)
    }
    expect(OCEAN_SPECTRUM.length - WAVE_VERTEX).toBeGreaterThan(3)
  })

  it('is a wind sea with a swell across it, not a confused one', () => {
    // Scattered bearings give a lumpy pond. A wind sea runs as long parallel
    // crests: most of the energy within a quadrant of one bearing, and the
    // odd one out is the swell arriving from somewhere else.
    const unit = (w: (typeof OCEAN_SPECTRUM)[number]) => {
      const len = Math.hypot(w.dir[0], w.dir[1])
      return [w.dir[0] / len, w.dir[1] / len] as const
    }
    const wind = unit(OCEAN_SPECTRUM[1])
    const aligned = OCEAN_SPECTRUM.filter((w) => {
      const d = unit(w)
      return d[0] * wind[0] + d[1] * wind[1] > Math.cos(Math.PI / 4)
    })
    expect(aligned.length).toBeGreaterThanOrEqual(OCEAN_SPECTRUM.length - 2)
    // Every direction has to be near enough unit length that normalising it
    // in the shader does not quietly change the table's meaning.
    for (const w of OCEAN_SPECTRUM) {
      expect(Math.hypot(w.dir[0], w.dir[1])).toBeCloseTo(1, 1)
    }
  })

  it('stands the swell at a height a real swell stands at', () => {
    // Amplitude is no longer a free number: A = steepness / k, scaled once.
    // The longest component should come out a few units, and its steepness on
    // the water should land in the open-ocean swell range rather than looking
    // like surf.
    const swell = OCEAN_SPECTRUM[0]
    const amplitude = (swell.steepness / k(swell)) * islandConfig.ocean.amplitude
    expect(amplitude).toBeGreaterThan(3)
    expect(amplitude).toBeLessThan(12)
    expect(amplitude * k(swell)).toBeLessThan(0.08)
  })
})
