import * as THREE from 'three'
import type { BlendedPreset } from '@/scene/timeOfDay/blendPreset'

/**
 * The reflection probe: a small equirectangular sky, as a pure writer into a
 * reusable buffer.
 *
 * This is what the glazing and metalwork mirror, and what lights everything the
 * direct lights miss. It has to carry structure rather than a flat wash, and it
 * has to change with the hour or the tower reflects midday at midnight — which
 * it did, and which measurably made night come out warmer than noon.
 *
 * Deliberately hand-rolled rather than a library sky: the app fetches nothing at
 * runtime, and this only has to be convincing in reflection and as a light
 * source. It is never looked at directly — the dome in front of it is what you
 * see — which is why its sun is a soft bloom rather than the dome's hard disc.
 */

export const SKY_WIDTH = 256
export const SKY_HEIGHT = 128
/** Floats per texel: RGBA. */
export const SKY_STRIDE = 4

/** A dawn horizon, warmed toward the sun rather than ringing the whole sky. */
const HORIZON_WARM = new THREE.Color('#ff9a5c')

export interface SkyParams {
  skyColor: THREE.Color
  groundColor: THREE.Color
  sunColor: THREE.Color
  sunGlow: number
  sunAzimuthDeg: number
  sunElevationDeg: number
  /** 0 leaves the horizon exactly as it was before dawn existed. */
  horizonWarmth: number
}

/** Pull the probe's parameters out of a blended hour. */
export function skyParamsFrom(blend: BlendedPreset): SkyParams {
  return {
    skyColor: blend.hemisphere.skyColor,
    groundColor: blend.hemisphere.groundColor,
    sunColor: blend.sunDisc.color,
    sunGlow: blend.probe.sunGlow,
    // The probe follows the VISIBLE sun, not the shadow caster: a highlight
    // that stayed high in the sky after sunset would be the one thing on screen
    // insisting it is still daytime.
    sunAzimuthDeg: blend.sunDisc.azimuthDeg,
    sunElevationDeg: blend.sunDisc.elevationDeg,
    horizonWarmth: blend.probe.horizonWarmth,
  }
}

/**
 * Paint one probe into `data`. Allocation-free and deterministic: the same
 * parameters always produce the same buffer.
 */
export function writeEquirect(data: Float32Array, p: SkyParams): Float32Array {
  const sky = p.skyColor
  const ground = p.groundColor
  const sun = p.sunColor
  const sunAz = (p.sunAzimuthDeg * Math.PI) / 180
  const sunEl = (p.sunElevationDeg * Math.PI) / 180

  for (let y = 0; y < SKY_HEIGHT; y++) {
    // v: 0 at top (zenith) → 1 at bottom (nadir); elevation in [-π/2, π/2].
    const v = y / (SKY_HEIGHT - 1)
    const elevation = Math.PI / 2 - v * Math.PI
    for (let x = 0; x < SKY_WIDTH; x++) {
      const u = x / (SKY_WIDTH - 1)
      const azimuth = u * Math.PI * 2 - Math.PI

      let r: number, g: number, b: number
      if (elevation >= 0) {
        // Sky: brighter toward the horizon, softly toward zenith.
        const t = 1 - elevation / (Math.PI / 2)
        r = sky.r * (0.55 + 0.45 * t)
        g = sky.g * (0.55 + 0.45 * t)
        b = sky.b * (0.6 + 0.4 * t)
      } else {
        const t = Math.min(1, -elevation / (Math.PI / 4))
        r = ground.r * (1 - 0.5 * t)
        g = ground.g * (1 - 0.5 * t)
        b = ground.b * (1 - 0.5 * t)
      }

      // Soft cloud banding, so the curtain wall mirrors something with
      // structure instead of a flat wash.
      if (elevation >= 0) {
        const bands =
          Math.sin(elevation * 9 + Math.sin(azimuth * 2) * 0.8) * 0.5 +
          Math.sin(elevation * 21 + azimuth) * 0.25
        const cloud = Math.max(0, bands) * 0.16 * Math.min(1, elevation * 3)
        r += cloud
        g += cloud
        b += cloud * 0.95
      }

      const dAz = Math.atan2(Math.sin(azimuth - sunAz), Math.cos(azimuth - sunAz))

      // Dawn and dusk warmth: a band hugging the horizon, strongest toward the
      // sun and fading away from it.
      if (p.horizonWarmth > 0 && elevation > -0.12) {
        const nearHorizon = Math.exp(-(elevation * elevation) / 0.045)
        const towardSun = 0.35 + 0.65 * Math.max(0, Math.cos(dAz))
        const warm = nearHorizon * towardSun * p.horizonWarmth * 0.5
        r += HORIZON_WARM.r * warm
        g += HORIZON_WARM.g * warm
        b += HORIZON_WARM.b * warm
      }

      // Bloom around the sun's direction, for specular interest on the glass.
      const dEl = elevation - sunEl
      const angular = Math.hypot(dAz * Math.cos(sunEl), dEl)
      const glow = Math.exp(-(angular * angular) / 0.08) * p.sunGlow
      r += sun.r * glow
      g += sun.g * glow
      b += sun.b * glow

      const i = (y * SKY_WIDTH + x) * SKY_STRIDE
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 1
    }
  }

  return data
}

/**
 * Wrap a painted buffer in a texture ready for `scene.environment`.
 *
 * A fresh `DataTexture` each time, over the *same* array. That is not
 * wastefulness: three caches the PMREM convolution of an environment map in a
 * WeakMap keyed by the texture object, and its regeneration path is gated on the
 * texture being a render-target texture, which a DataTexture is not. So mutating
 * one in place and setting `needsUpdate` re-uploads the pixels but leaves every
 * reflection in the scene showing the old sky. Replacing the object — and
 * disposing the previous one, which frees its cached target — is the supported
 * way to say the environment has changed, and skipping the dispose leaks a
 * convolved cubemap per rebuild.
 */
export function skyTexture(data: Float32Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, SKY_WIDTH, SKY_HEIGHT, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.needsUpdate = true
  return tex
}
