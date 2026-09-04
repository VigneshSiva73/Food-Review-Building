import { describe, expect, it } from 'vitest'
import { TIME_PRESETS, timeOfDayConfig } from '@/config'
import { buildCloudField, CLOUD_FIELD_HALF } from './cloudField'

const field = buildCloudField()

describe('buildCloudField', () => {
  it('is byte-identical between builds', () => {
    const again = buildCloudField()
    expect(Array.from(again.positions)).toEqual(Array.from(field.positions))
    expect(Array.from(again.scales)).toEqual(Array.from(field.scales))
  })

  it('lays out six vertices per quad, with every attribute filled', () => {
    const verts = field.quads * 6
    expect(field.positions.length).toBe(verts * 3)
    expect(field.corners.length).toBe(verts * 2)
    for (const [name, arr] of [
      ['scales', field.scales],
      ['opacities', field.opacities],
      ['drifts', field.drifts],
    ] as const) {
      expect(`${name}:${arr.length}`).toBe(`${name}:${verts}`)
      expect(`${name} finite:${arr.every((v) => Number.isFinite(v) && v > 0)}`).toBe(
        `${name} finite:true`,
      )
    }
  })

  it('stays cheap enough to be one draw call worth having', () => {
    // The whole sky is one buffer; this is the budget that keeps it that way.
    // A cloud made of more, smaller puffs looks no better from the distance
    // these sit at and costs linearly.
    expect(field.quads).toBeLessThanOrEqual(140)
    expect(field.quads * 2).toBeLessThanOrEqual(280) // triangles
    expect(field.quads).toBeGreaterThan(60)
  })

  it('keeps a cluster together as it travels', () => {
    // Drift is per CLOUD, not per puff. Give each blob its own speed and the
    // cluster pulls itself apart as it crosses the sky.
    const perQuad = new Set<number>()
    for (let q = 0; q < field.quads; q++) perQuad.add(field.drifts[q * 6])
    // One speed per cloud, so at most that many distinct values however
    // many quads there are.
    expect(perQuad.size).toBeLessThanOrEqual(22)
    // And every vertex of a quad agrees, or the quad would shear.
    for (let q = 0; q < field.quads; q++) {
      const first = field.drifts[q * 6]
      for (let v = 1; v < 6; v++) {
        expect(`quad ${q} vertex ${v}:${field.drifts[q * 6 + v] === first}`).toBe(
          `quad ${q} vertex ${v}:true`,
        )
      }
    }
  })

  it('sits far out and low, where the camera is actually looking', () => {
    // The same framing constraint that decided the moon's height. The opening
    // camera looks about eighteen degrees downward, so a cloud at a realistic
    // altitude overhead is simply not in the picture — these are placed by the
    // ratio of altitude to distance, which is what puts them a few degrees up.
    for (let i = 0; i < field.positions.length; i += 3) {
      const x = field.positions[i]
      const y = field.positions[i + 1]
      const z = field.positions[i + 2]
      const distance = Math.hypot(x, z)
      const elevation = (Math.atan2(y, distance) * 180) / Math.PI
      // The band the camera actually shows. Below eleven they are behind the
      // skyline, above twenty they are off the top of the frame — and puffs
      // are offset from their cloud's centre, so allow for that spread.
      expect(`elevation ${elevation.toFixed(1)} in band:${elevation > 6 && elevation < 26}`).toBe(
        `elevation ${elevation.toFixed(1)} in band:true`,
      )
      // Far enough out that nothing can drift into the tower.
      expect(`distance:${distance > 900}`).toBe('distance:true')
      expect(`within field:${Math.abs(x) <= CLOUD_FIELD_HALF}`).toBe('within field:true')
    }
  })

  it('varies size and opacity, so no two clouds read as copies', () => {
    expect(new Set(Array.from(field.scales)).size).toBeGreaterThan(10)
    expect(new Set(Array.from(field.opacities)).size).toBeGreaterThan(10)
    expect(Math.max(...field.opacities)).toBeLessThanOrEqual(0.8)
  })
})

describe('cloud levels over the day', () => {
  const KEYS = timeOfDayConfig.keys
  const at = (hour: number) => KEYS.find((k) => k.hour === hour)!

  it('keeps clouds in the sky at every hour', () => {
    // Clouds do not clear at night — they go dark. Fading them out entirely
    // would leave a suspiciously clean sky exactly when the stars come out.
    for (const k of KEYS) {
      expect(`${k.hour} present:${k.cloud.opacity > 0.2}`).toBe(`${k.hour} present:true`)
    }
  })

  it('catches the sun on their flanks at dusk, after the ground has lost it', () => {
    // The thing clouds are FOR in a sunset. They are lit from outside the
    // palette that governs everything below them, so they stay bright while
    // the city has already gone dim.
    const warmth = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16)
    expect(warmth(at(19).cloud.tint)).toBeGreaterThan(warmth(at(TIME_PRESETS.day).cloud.tint))
    expect(at(19).cloud.opacity).toBeGreaterThan(at(TIME_PRESETS.day).cloud.opacity)
  })

  it('goes dark and cool at night', () => {
    const night = at(TIME_PRESETS.night).cloud.tint
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(night.slice(i, i + 2), 16))
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeLessThan(60)
    expect(b).toBeGreaterThan(r)
  })
})
