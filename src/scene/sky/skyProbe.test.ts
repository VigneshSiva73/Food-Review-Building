import { describe, expect, it } from 'vitest'
import { TIME_PRESETS } from '@/config'
import { presetAt } from '@/scene/timeOfDay/presetAt'
import {
  SKY_HEIGHT,
  SKY_STRIDE,
  SKY_WIDTH,
  skyParamsFrom,
  skyTexture,
  writeEquirect,
} from './skyProbe'

const buffer = () => new Float32Array(SKY_WIDTH * SKY_HEIGHT * SKY_STRIDE)

/** Mean luminance of the upper (sky) half of a painted probe. */
function skyLuminance(data: Float32Array): number {
  let total = 0
  let count = 0
  for (let y = 0; y < SKY_HEIGHT / 2; y++) {
    for (let x = 0; x < SKY_WIDTH; x++) {
      const i = (y * SKY_WIDTH + x) * SKY_STRIDE
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      count++
    }
  }
  return total / count
}

describe('writeEquirect', () => {
  it('is deterministic, so a rebuild mid-sweep never flickers', () => {
    // The probe repaints ten times a second while the hour moves. Anything
    // random in here would swarm rather than fade.
    const a = writeEquirect(buffer(), skyParamsFrom(presetAt(TIME_PRESETS.day)))
    const b = writeEquirect(buffer(), skyParamsFrom(presetAt(TIME_PRESETS.day)))
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('writes into the buffer it is given, allocating nothing', () => {
    const out = buffer()
    expect(writeEquirect(out, skyParamsFrom(presetAt(12)))).toBe(out)
  })

  it('fills every texel with an opaque colour', () => {
    // Scanned in plain JS with one assertion at the end rather than 32k
    // assertions: an expect() per texel took six seconds and said nothing more.
    const data = writeEquirect(buffer(), skyParamsFrom(presetAt(TIME_PRESETS.night)))
    let bad = 0
    for (let i = 0; i < data.length; i += SKY_STRIDE) {
      if (!Number.isFinite(data[i]) || data[i] < 0 || data[i + 3] !== 1) bad++
    }
    expect(`bad texels: ${bad}`).toBe('bad texels: 0')
  })

  it('reflects a darker sky at night than at noon', () => {
    // The failure this closes. The probe was built once from the day key, so
    // the tower mirrored midday at midnight — and with the direct light down
    // eightfold after dusk, that stale daylight bounce dominated the ambient
    // and measurably made night render WARMER than noon.
    const day = skyLuminance(writeEquirect(buffer(), skyParamsFrom(presetAt(TIME_PRESETS.day))))
    const night = skyLuminance(
      writeEquirect(buffer(), skyParamsFrom(presetAt(TIME_PRESETS.night))),
    )
    expect(night).toBeLessThan(day * 0.5)
  })

  it('follows the visible sun, not the shadow caster', () => {
    // They are different bodies on purpose: the caster stays high all night so
    // shadows keep working, while the disc sets. A probe tracking the caster
    // would keep a specular highlight high in the sky after sunset — the one
    // thing on screen insisting it is still daytime.
    const sunset = presetAt(19)
    const params = skyParamsFrom(sunset)
    expect(params.sunElevationDeg).toBe(sunset.sunDisc.elevationDeg)
    expect(params.sunElevationDeg).toBeLessThan(sunset.caster.elevationDeg)
  })

  it('warms the horizon toward the sun at dusk, not evenly around it', () => {
    // A band ringing the whole sky reads as a filter over the image rather than
    // as light coming from somewhere.
    const data = writeEquirect(buffer(), skyParamsFrom(presetAt(19)))
    const rowAtHorizon = Math.floor(SKY_HEIGHT / 2) - 1
    const warmth = (x: number) => {
      const i = (rowAtHorizon * SKY_WIDTH + x) * SKY_STRIDE
      return data[i] - data[i + 2]
    }
    const sunAz = presetAt(19).sunDisc.azimuthDeg
    const towardSun = Math.floor((((sunAz + 180) % 360) / 360) * SKY_WIDTH)
    const away = (towardSun + SKY_WIDTH / 2) % SKY_WIDTH
    expect(warmth(towardSun)).toBeGreaterThan(warmth(Math.floor(away)))
  })
})

describe('skyTexture', () => {
  it('hands back a NEW texture over the same buffer each time', () => {
    // Not wastefulness. Three caches the PMREM convolution in a WeakMap keyed
    // by the texture OBJECT, and its regeneration path is gated on the texture
    // being a render target, which a DataTexture is not — so mutating one in
    // place and setting `needsUpdate` re-uploads the pixels and leaves every
    // reflection showing the old sky.
    // A bare buffer, not a painted one. This is about texture IDENTITY, and
    // painting 32k texels first is work the assertion never looks at.
    //
    // It still carries an explicit timeout. Trimming the work was not enough
    // once the city grew: this file shares a machine with a suite that now
    // builds a whole district per test file, and the five-second default was
    // being missed on load rather than on anything this test does.
    const data = buffer()
    const first = skyTexture(data)
    const second = skyTexture(data)
    expect(second).not.toBe(first)
    expect(second.image.data).toBe(data)
    // `needsUpdate` is write-only on a three.js texture — reading it gives
    // undefined. What it actually does is bump the version, which is what the
    // renderer watches, so that is what gets checked.
    expect(second.version).toBeGreaterThan(0)
    first.dispose()
    second.dispose()
  }, 15_000)
})
