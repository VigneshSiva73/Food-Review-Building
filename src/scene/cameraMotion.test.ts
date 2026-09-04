import { describe, expect, it } from 'vitest'
import { cameraConfig } from '@/config'
import {
  advanceFlight,
  arcBulge,
  shortestAngleDelta,
  smootherstep,
  targetLift,
  travelDuration,
} from './cameraMotion'
import { MAX_FRAME_DELTA_S } from '@/utils/motion'

describe('shortestAngleDelta', () => {
  it('never takes the long way round', () => {
    for (let a = -Math.PI; a <= Math.PI; a += 0.3) {
      for (let b = -Math.PI; b <= Math.PI; b += 0.3) {
        expect(Math.abs(shortestAngleDelta(a, b))).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
    }
  })

  it('crosses the ±π seam the short way', () => {
    // 170° to -170° is 20° forward, not 340° back.
    const delta = shortestAngleDelta((170 * Math.PI) / 180, (-170 * Math.PI) / 180)
    expect((delta * 180) / Math.PI).toBeCloseTo(20)
  })

  it('lands on the destination direction (angles are modulo 2π)', () => {
    const a = 1.1
    const b = -2.4
    const end = a + shortestAngleDelta(a, b)
    expect(Math.cos(end)).toBeCloseTo(Math.cos(b))
    expect(Math.sin(end)).toBeCloseTo(Math.sin(b))
  })
})

describe('smootherstep', () => {
  it('pins both endpoints and the midpoint', () => {
    expect(smootherstep(0)).toBe(0)
    expect(smootherstep(1)).toBe(1)
    expect(smootherstep(0.5)).toBeCloseTo(0.5)
  })

  it('clamps outside the unit interval', () => {
    expect(smootherstep(-3)).toBe(0)
    expect(smootherstep(4)).toBe(1)
  })

  it('starts and ends gently — that is what reads as filmed', () => {
    // Near-zero slope at both ends: barely any progress in the first/last 5%.
    expect(smootherstep(0.05)).toBeLessThan(0.01)
    expect(smootherstep(0.95)).toBeGreaterThan(0.99)
    // ...and correspondingly quicker through the middle.
    expect(smootherstep(0.6) - smootherstep(0.4)).toBeGreaterThan(0.35)
  })

  it('never goes backwards', () => {
    let previous = -1
    for (let t = 0; t <= 1; t += 0.02) {
      const v = smootherstep(t)
      expect(v).toBeGreaterThanOrEqual(previous)
      previous = v
    }
  })
})

describe('travelDuration', () => {
  it('keeps short hops snappy and long flights unhurried', () => {
    const short = travelDuration(10) // stepping one floor
    const long = travelDuration(600) // crossing the whole tower
    expect(short).toBeLessThan(cameraConfig.focus.minDurationMs * 1.2)
    expect(long).toBeGreaterThan(short * 1.5)
  })

  it('is clamped at both ends', () => {
    expect(travelDuration(0)).toBe(cameraConfig.focus.minDurationMs)
    expect(travelDuration(-5)).toBe(cameraConfig.focus.minDurationMs)
    expect(travelDuration(1e6)).toBe(cameraConfig.focus.maxDurationMs)
  })

  it('grows with distance', () => {
    expect(travelDuration(200)).toBeGreaterThan(travelDuration(50))
  })
})

describe('arcBulge', () => {
  it('is neutral at both ends so the endpoints stay exact', () => {
    expect(arcBulge(0)).toBeCloseTo(1)
    expect(arcBulge(1)).toBeCloseTo(1)
  })

  it('pulls the camera back at mid-flight', () => {
    expect(arcBulge(0.5)).toBeCloseTo(1 + cameraConfig.focus.arcBulge)
    expect(arcBulge(0.5)).toBeGreaterThan(arcBulge(0.2))
  })
})

describe('advanceFlight', () => {
  const DURATION = 2000

  it('does not let an idle-time delta swallow the whole flight', () => {
    // The bug: under frameloop="demand" the first frame after the scene sits
    // idle reports the entire idle span as its delta. Unclamped, that put
    // progress straight at 1 and the camera teleported instead of travelling.
    expect(advanceFlight(0, 5, DURATION)).toBeCloseTo(
      (MAX_FRAME_DELTA_S * 1000) / DURATION,
    )
    expect(advanceFlight(0, 5, DURATION)).toBeLessThan(0.1)
  })

  it('advances a normal frame by exactly its share of the duration', () => {
    expect(advanceFlight(0, 0.016, DURATION)).toBeCloseTo(16 / DURATION)
    expect(advanceFlight(0.5, 0.016, DURATION)).toBeCloseTo(0.5 + 16 / DURATION)
  })

  it('takes about the requested duration at 60fps', () => {
    let t = 0
    let elapsedMs = 0
    let frames = 0
    while (t < 1 && frames < 10_000) {
      t = advanceFlight(t, 1 / 60, DURATION)
      elapsedMs += 1000 / 60
      frames++
    }
    expect(t).toBe(1)
    // Within a frame of the intended duration (accumulating 120 float steps
    // drifts by a few picoseconds, so compare with a frame of tolerance).
    const frameMs = 1000 / 60
    expect(elapsedMs).toBeGreaterThan(DURATION - frameMs)
    expect(elapsedMs).toBeLessThan(DURATION + 2 * frameMs)
  })

  it('still animates smoothly when the first frame is a huge idle spike', () => {
    // Reproduces the real sequence: long idle, then steady frames.
    let t = advanceFlight(0, 4.2, DURATION)
    expect(t).toBeLessThan(0.1) // did not jump to the destination
    let frames = 1
    while (t < 1 && frames < 10_000) {
      t = advanceFlight(t, 1 / 60, DURATION)
      frames++
    }
    expect(frames).toBeGreaterThan(100) // a real move, not a teleport
  })

  it('ignores zero and negative deltas, and never overshoots or reverses', () => {
    expect(advanceFlight(0.3, 0, DURATION)).toBe(0.3)
    expect(advanceFlight(0.3, -2, DURATION)).toBe(0.3)
    expect(advanceFlight(0.99, 1, DURATION)).toBe(1)
    let previous = 0
    for (let i = 0; i < 200; i++) {
      const next = advanceFlight(previous, 1 / 60, DURATION)
      expect(next).toBeGreaterThanOrEqual(previous)
      expect(next).toBeLessThanOrEqual(1)
      previous = next
    }
  })
})

describe('targetLift', () => {
  it('is neutral at both ends so the endpoints stay exact', () => {
    expect(targetLift(0)).toBeCloseTo(0)
    expect(targetLift(1)).toBeCloseTo(0)
  })

  it('raises the look-at point through the middle of the move', () => {
    expect(targetLift(0.5)).toBeCloseTo(cameraConfig.focus.targetLift)
    expect(targetLift(0.5)).toBeGreaterThan(targetLift(0.15))
  })
})
