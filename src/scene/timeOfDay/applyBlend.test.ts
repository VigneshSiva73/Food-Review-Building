import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { TIME_PRESETS } from '@/config'
import { applyBlend, sunPositionFromAngles } from './applyBlend'
import { presetAt } from './presetAt'
import { registerLights, registerScene } from './registry'

/** A scene graph just complete enough for the driver to write onto. */
function stage() {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 1, 2)
  const background = new THREE.Color()
  scene.background = background
  const lights = {
    hemisphere: new THREE.HemisphereLight(),
    caster: new THREE.DirectionalLight(),
    fill: new THREE.DirectionalLight(),
    boundingRadius: 80,
    totalHeight: 400,
  }
  const releases = [registerLights(lights), registerScene({ scene, background })]
  return { scene, background, lights, release: () => releases.forEach((r) => r()) }
}

let current: ReturnType<typeof stage> | null = null
afterEach(() => {
  current?.release()
  current = null
})

describe('sunPositionFromAngles', () => {
  it('rides a constant arc whatever the angles', () => {
    // The radius depends only on content size, never on the angle. That is
    // what makes a travelling light cheap: the shadow camera's near and far
    // planes stay valid all day, so nothing about the frustum is recomputed
    // when the hour changes — only the direction it looks from.
    const height = 400
    const reach = (az: number, el: number) => {
      const [x, y, z] = sunPositionFromAngles(az, el, 80, height)
      return Math.hypot(x, y - height * 0.5, z)
    }
    expect(reach(35, 35)).toBeCloseTo(reach(-55, 40), 6)
    expect(reach(120, 14)).toBeCloseTo(reach(0, 89), 6)
  })

  it('puts the light above the content', () => {
    const [, y] = sunPositionFromAngles(35, 35, 80, 400)
    expect(y).toBeGreaterThan(400)
  })
})

describe('applyBlend', () => {
  it('writes the hour onto every registered light', () => {
    current = stage()
    const night = presetAt(TIME_PRESETS.night)
    applyBlend(night)
    const { hemisphere, caster, fill } = current.lights
    expect(caster.color.getHexString()).toBe(night.caster.color.getHexString())
    expect(caster.intensity).toBeCloseTo(night.caster.intensity, 10)
    expect(hemisphere.intensity).toBeCloseTo(night.hemisphere.intensity, 10)
    expect(fill.intensity).toBeCloseTo(night.fill.intensity, 10)
  })

  it('keeps the fill opposite the light it exists to soften', () => {
    // The fill's whole job is stopping the shadowed side going flat, so it has
    // to follow the caster around rather than sit at a fixed angle.
    current = stage()
    applyBlend(presetAt(TIME_PRESETS.day))
    const { caster, fill } = current.lights
    expect(fill.position.x).toBeCloseTo(-caster.position.x, 6)
    expect(fill.position.z).toBeCloseTo(-caster.position.z, 6)
    expect(fill.position.y).toBeGreaterThan(0)
    expect(fill.position.y).toBeLessThan(caster.position.y)
  })

  it('gives the fog and the background one colour, always', () => {
    // A haze that differs from the sky re-lights the distant ground and leaves
    // a visible arc where the ground disc ends. They used to be two strings
    // that happened to match; they are now one field on the keyframe, and this
    // is the guard that they still arrive as one.
    current = stage()
    for (const hour of Object.values(TIME_PRESETS)) {
      applyBlend(presetAt(hour))
      const fog = current.scene.fog as THREE.Fog
      expect(`${hour}:${fog.color.getHexString()}`).toBe(
        `${hour}:${current.background.getHexString()}`,
      )
    }
  })

  it('mutates the background it was given rather than replacing it', () => {
    // The driver owns one Color object; `<color attach="background">` was
    // removed from the tree so nothing can swap it out mid-sweep. Replacing it
    // here would reintroduce exactly the second writer that was removed.
    current = stage()
    const owned = current.background
    applyBlend(presetAt(TIME_PRESETS.night))
    expect(current.scene.background).toBe(owned)
  })

  it('carries the environment intensity onto the scene', () => {
    current = stage()
    const night = presetAt(TIME_PRESETS.night)
    applyBlend(night)
    expect(current.scene.environmentIntensity).toBeCloseTo(night.environmentIntensity, 10)
  })

  it('does nothing at all when nothing has registered', () => {
    // The city switching on, the lights re-fitting, an unmount mid-sweep — the
    // driver keeps writing throughout, so a missing handle has to be ordinary
    // rather than an exception in the middle of an animation.
    expect(() => applyBlend(presetAt(12))).not.toThrow()
  })
})
