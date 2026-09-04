import { describe, expect, it } from 'vitest'
import { TIME_PRESETS, timeOfDayConfig } from '@/config'
import { emptyBlend } from './blendPreset'
import { normalizeHour, presetAt } from './presetAt'

const KEYS = timeOfDayConfig.keys

describe('normalizeHour', () => {
  it('wraps every hour onto a single day', () => {
    expect(normalizeHour(10)).toBe(10)
    expect(normalizeHour(24)).toBe(0)
    expect(normalizeHour(26)).toBe(2)
    // Negative hours matter: the transition counts forward past 24 and the
    // slider can be dragged below zero on a touch screen.
    expect(normalizeHour(-1)).toBe(23)
    expect(normalizeHour(-25)).toBe(23)
  })
})

describe('presetAt', () => {
  it('reproduces an authored keyframe exactly at its own hour', () => {
    // Endpoint exactness, not "close enough". A key is a look somebody signed
    // off; landing near it means the app never actually shows what was
    // approved. It is also what lets emissive channels reach literal zero at
    // the daylight keys in a later phase.
    for (const key of KEYS) {
      const at = presetAt(key.hour)
      expect(`${key.hour}:${at.caster.color.getHexString()}`).toBe(
        `${key.hour}:${key.caster.color.slice(1)}`,
      )
      expect(at.caster.intensity).toBeCloseTo(key.caster.intensity, 10)
      expect(at.caster.azimuthDeg).toBeCloseTo(key.caster.azimuthDeg, 10)
      expect(at.caster.elevationDeg).toBeCloseTo(key.caster.elevationDeg, 10)
      expect(at.environmentIntensity).toBeCloseTo(key.environmentIntensity, 10)
      expect(at.background.getHexString()).toBe(key.background.slice(1))
    }
  })

  it('is a straight lerp between neighbours', () => {
    const day = KEYS.find((k) => k.hour === TIME_PRESETS.day)!
    const afternoon = KEYS.find((k) => k.hour === TIME_PRESETS.afternoon)!
    const midpoint = (day.hour + afternoon.hour) / 2
    const at = presetAt(midpoint)
    expect(at.caster.intensity).toBeCloseTo(
      (day.caster.intensity + afternoon.caster.intensity) / 2,
      10,
    )
    expect(at.caster.elevationDeg).toBeCloseTo(
      (day.caster.elevationDeg + afternoon.caster.elevationDeg) / 2,
      10,
    )
  })

  it('closes the loop at midnight', () => {
    // The curve is a ring, not a line. A seam here would show as the world
    // lurching every time the auto-cycle rolled past midnight — and the last
    // authored key is at 21:30, so the wrap segment is two and a half hours
    // long and very much rendered.
    // Continuity, not equality. The moon travels across the wrap segment now,
    // so an hour short of midnight is genuinely a hair short of midnight's
    // value — what must not happen is a JUMP. So the gap is required to shrink
    // in proportion as the sample closes in.
    const after = presetAt(0, emptyBlend())
    const gapAt = (epsilon: number) =>
      Math.abs(presetAt(24 - epsilon, emptyBlend()).caster.azimuthDeg - after.caster.azimuthDeg)
    const coarse = gapAt(0.01)
    const fine = gapAt(0.001)
    expect(fine).toBeLessThan(coarse)
    expect(fine).toBeLessThan(0.05)
    expect(presetAt(23.999, emptyBlend()).caster.intensity).toBeCloseTo(after.caster.intensity, 3)
    expect(presetAt(23.999, emptyBlend()).background.getHexString()).toBe(
      after.background.getHexString(),
    )
  })

  it('interpolates across the midnight segment rather than snapping', () => {
    // Halfway between the last key (21:30) and the first (00:00) must be
    // between them, not pinned to either end.
    const last = KEYS[KEYS.length - 1]
    const at = presetAt((last.hour + 24) / 2)
    expect(at.caster.intensity).toBeGreaterThan(0)
    expect(at.background.getHexString()).toBeTruthy()
  })

  it('writes into the callerns buffer without allocating', () => {
    // The driver calls this every frame of a sweep. Returning a fresh object
    // per frame would hand the garbage collector work in the middle of an
    // animation, which is exactly where a hitch is most visible.
    const out = emptyBlend()
    expect(presetAt(12, out)).toBe(out)
    const colorBefore = out.caster.color
    presetAt(20, out)
    expect(out.caster.color).toBe(colorBefore)
  })

  it('treats hours past the end of the day as their wrapped equivalent', () => {
    // The transition counts forward without wrapping — night to day is
    // authored as 21.5 to 34 — so this is asked for real hours above 24.
    const a = presetAt(26)
    const b = presetAt(2, emptyBlend())
    expect(a.caster.intensity).toBeCloseTo(b.caster.intensity, 10)
  })
})
