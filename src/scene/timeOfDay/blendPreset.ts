import * as THREE from 'three'
import type { HourKeyframe } from '@/config'

/**
 * A keyframe in a form that can be interpolated every frame.
 *
 * The config holds colours as hex strings, which is the right surface for a
 * file a human edits and the wrong one for a hot path: `Color.set` parses the
 * string on every call. So the strings are parsed once into `THREE.Color`s
 * here and everything downstream reads those.
 *
 * Every function in this module writes into a caller-supplied output, so a
 * running transition allocates nothing per frame.
 */
export interface BlendedPreset {
  caster: { color: THREE.Color; intensity: number; azimuthDeg: number; elevationDeg: number }
  hemisphere: { skyColor: THREE.Color; groundColor: THREE.Color; intensity: number }
  fill: { color: THREE.Color; intensity: number }
  environmentIntensity: number
  /** Backdrop, fog, AND the sky's horizon — one value by contract. */
  background: THREE.Color
  sky: { zenith: THREE.Color; glowColor: THREE.Color; glowStrength: number }
  sunDisc: {
    color: THREE.Color
    sizeDeg: number
    intensity: number
    azimuthDeg: number
    elevationDeg: number
  }
  moonDisc: {
    color: THREE.Color
    sizeDeg: number
    intensity: number
    azimuthDeg: number
    elevationDeg: number
  }
  starIntensity: number
  cloud: { tint: THREE.Color; opacity: number }
  milkyWay: number
  probe: { sunGlow: number; horizonWarmth: number }
  city: { windowGlow: number; lampGlow: number }
  hero: { plateGlow: number; glassGlow: number }
}

/** An empty blend, for use as scratch. Values are overwritten before use. */
export function emptyBlend(): BlendedPreset {
  return {
    caster: { color: new THREE.Color(), intensity: 0, azimuthDeg: 0, elevationDeg: 0 },
    hemisphere: { skyColor: new THREE.Color(), groundColor: new THREE.Color(), intensity: 0 },
    fill: { color: new THREE.Color(), intensity: 0 },
    environmentIntensity: 0,
    background: new THREE.Color(),
    sky: { zenith: new THREE.Color(), glowColor: new THREE.Color(), glowStrength: 0 },
    sunDisc: {
      color: new THREE.Color(),
      sizeDeg: 1,
      intensity: 0,
      azimuthDeg: 0,
      elevationDeg: 0,
    },
    moonDisc: {
      color: new THREE.Color(),
      sizeDeg: 1,
      intensity: 0,
      azimuthDeg: 0,
      elevationDeg: 0,
    },
    starIntensity: 0,
    cloud: { tint: new THREE.Color(), opacity: 0 },
    milkyWay: 0,
    probe: { sunGlow: 0, horizonWarmth: 0 },
    city: { windowGlow: 0, lampGlow: 0 },
    hero: { plateGlow: 0, glassGlow: 0 },
  }
}

/** Parse a keyframe into blendable form. Allocates only if `out` is omitted. */
export function toBlended(k: HourKeyframe, out: BlendedPreset = emptyBlend()): BlendedPreset {
  out.caster.color.set(k.caster.color)
  out.caster.intensity = k.caster.intensity
  out.caster.azimuthDeg = k.caster.azimuthDeg
  out.caster.elevationDeg = k.caster.elevationDeg
  out.hemisphere.skyColor.set(k.hemisphere.skyColor)
  out.hemisphere.groundColor.set(k.hemisphere.groundColor)
  out.hemisphere.intensity = k.hemisphere.intensity
  out.fill.color.set(k.fill.color)
  out.fill.intensity = k.fill.intensity
  out.environmentIntensity = k.environmentIntensity
  out.background.set(k.background)
  out.sky.zenith.set(k.sky.zenith)
  out.sky.glowColor.set(k.sky.glowColor)
  out.sky.glowStrength = k.sky.glowStrength
  out.sunDisc.color.set(k.sunDisc.color)
  out.sunDisc.sizeDeg = k.sunDisc.sizeDeg
  out.sunDisc.intensity = k.sunDisc.intensity
  out.sunDisc.azimuthDeg = k.sunDisc.azimuthDeg
  out.sunDisc.elevationDeg = k.sunDisc.elevationDeg
  out.moonDisc.color.set(k.moonDisc.color)
  out.moonDisc.sizeDeg = k.moonDisc.sizeDeg
  out.moonDisc.intensity = k.moonDisc.intensity
  out.moonDisc.azimuthDeg = k.moonDisc.azimuthDeg
  out.moonDisc.elevationDeg = k.moonDisc.elevationDeg
  out.starIntensity = k.starIntensity
  out.cloud.tint.set(k.cloud.tint)
  out.cloud.opacity = k.cloud.opacity
  out.milkyWay = k.milkyWay
  out.probe.sunGlow = k.probe.sunGlow
  out.probe.horizonWarmth = k.probe.horizonWarmth
  out.city.windowGlow = k.city.windowGlow
  out.city.lampGlow = k.city.lampGlow
  out.hero.plateGlow = k.hero.plateGlow
  out.hero.glassGlow = k.hero.glassGlow
  return out
}

/**
 * Interpolate so that both ends are exact.
 *
 * The obvious `a + (b - a) * t` does not land on `b` at t=1: blending 2.4 to
 * 0.3 arrives at 0.2999999999999998. That matters because the emissive
 * channels arriving in a later phase have to reach *literal* zero at the
 * daylight keys — "almost off" is a lit material, and the resting state of the
 * daylight scene is pinned to zero by test. The weighted form is exact at both
 * endpoints.
 */
export const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t

/** Blend two keyframes into `out`. Allocation-free; safe to call every frame. */
export function lerpBlended(
  a: BlendedPreset,
  b: BlendedPreset,
  t: number,
  out: BlendedPreset,
): BlendedPreset {
  // Angles are plain lerps on purpose. The table authors them unwrapped with
  // every adjacent pair inside 180°, so there is no seam to take the short way
  // round — and a shortest-arc helper here would silently paper over a badly
  // authored key instead of letting its test fail.
  out.caster.color.lerpColors(a.caster.color, b.caster.color, t)
  out.caster.intensity = lerp(a.caster.intensity, b.caster.intensity, t)
  out.caster.azimuthDeg = lerp(a.caster.azimuthDeg, b.caster.azimuthDeg, t)
  out.caster.elevationDeg = lerp(a.caster.elevationDeg, b.caster.elevationDeg, t)
  out.hemisphere.skyColor.lerpColors(a.hemisphere.skyColor, b.hemisphere.skyColor, t)
  out.hemisphere.groundColor.lerpColors(a.hemisphere.groundColor, b.hemisphere.groundColor, t)
  out.hemisphere.intensity = lerp(a.hemisphere.intensity, b.hemisphere.intensity, t)
  out.fill.color.lerpColors(a.fill.color, b.fill.color, t)
  out.fill.intensity = lerp(a.fill.intensity, b.fill.intensity, t)
  out.environmentIntensity = lerp(a.environmentIntensity, b.environmentIntensity, t)
  out.background.lerpColors(a.background, b.background, t)
  out.sky.zenith.lerpColors(a.sky.zenith, b.sky.zenith, t)
  out.sky.glowColor.lerpColors(a.sky.glowColor, b.sky.glowColor, t)
  out.sky.glowStrength = lerp(a.sky.glowStrength, b.sky.glowStrength, t)
  out.sunDisc.color.lerpColors(a.sunDisc.color, b.sunDisc.color, t)
  out.sunDisc.sizeDeg = lerp(a.sunDisc.sizeDeg, b.sunDisc.sizeDeg, t)
  out.sunDisc.intensity = lerp(a.sunDisc.intensity, b.sunDisc.intensity, t)
  out.sunDisc.azimuthDeg = lerp(a.sunDisc.azimuthDeg, b.sunDisc.azimuthDeg, t)
  out.sunDisc.elevationDeg = lerp(a.sunDisc.elevationDeg, b.sunDisc.elevationDeg, t)
  out.moonDisc.color.lerpColors(a.moonDisc.color, b.moonDisc.color, t)
  out.moonDisc.sizeDeg = lerp(a.moonDisc.sizeDeg, b.moonDisc.sizeDeg, t)
  out.moonDisc.intensity = lerp(a.moonDisc.intensity, b.moonDisc.intensity, t)
  out.moonDisc.azimuthDeg = lerp(a.moonDisc.azimuthDeg, b.moonDisc.azimuthDeg, t)
  out.moonDisc.elevationDeg = lerp(a.moonDisc.elevationDeg, b.moonDisc.elevationDeg, t)
  out.starIntensity = lerp(a.starIntensity, b.starIntensity, t)
  out.cloud.tint.lerpColors(a.cloud.tint, b.cloud.tint, t)
  out.cloud.opacity = lerp(a.cloud.opacity, b.cloud.opacity, t)
  out.milkyWay = lerp(a.milkyWay, b.milkyWay, t)
  out.probe.sunGlow = lerp(a.probe.sunGlow, b.probe.sunGlow, t)
  out.probe.horizonWarmth = lerp(a.probe.horizonWarmth, b.probe.horizonWarmth, t)
  out.city.windowGlow = lerp(a.city.windowGlow, b.city.windowGlow, t)
  out.city.lampGlow = lerp(a.city.lampGlow, b.city.lampGlow, t)
  out.hero.plateGlow = lerp(a.hero.plateGlow, b.hero.plateGlow, t)
  out.hero.glassGlow = lerp(a.hero.glassGlow, b.hero.glassGlow, t)
  return out
}
