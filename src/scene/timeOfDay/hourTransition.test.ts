import { describe, expect, it } from 'vitest'
import { TIME_PRESETS, timeOfDayConfig } from '@/config'
import { MAX_FRAME_DELTA_S } from '@/utils/motion'
import {
  createHourTransition,
  durationFor,
  forwardDistance,
  retargetHour,
  tickHour,
} from './hourTransition'

/** Run a transition to completion, collecting the hour shown on each frame. */
function play(from: number, to: number, durationS: number, dt = 1 / 60): number[] {
  const t = retargetHour(createHourTransition(from), from, to, durationS)
  const seen: number[] = []
  for (let i = 0; i < 10_000 && !t.done; i++) seen.push(tickHour(t, dt))
  return seen
}

describe('forwardDistance', () => {
  it('always counts forwards', () => {
    // Time does not run backwards. Night to day is twelve and a half hours
    // ahead, not eleven and a half behind — which is what makes the sweep pass
    // through dawn instead of reversing back through dusk.
    expect(forwardDistance(10, 15)).toBeCloseTo(5)
    expect(forwardDistance(TIME_PRESETS.night, TIME_PRESETS.day)).toBeCloseTo(12.5)
    expect(forwardDistance(23, 1)).toBeCloseTo(2)
    expect(forwardDistance(10, 10)).toBeCloseTo(0)
  })
})

describe('durationFor', () => {
  it('scales with the distance travelled, within bounds', () => {
    const { baseS, maxS } = timeOfDayConfig.transition
    expect(durationFor(0)).toBeCloseTo(baseS)
    expect(durationFor(5)).toBeGreaterThan(durationFor(2))
    expect(durationFor(1000)).toBe(maxS)
  })
})

describe('hour transition', () => {
  it('travels day to night through the evening, never back through dawn', () => {
    const seen = play(TIME_PRESETS.day, TIME_PRESETS.night, 2)
    expect(seen[seen.length - 1]).toBeCloseTo(TIME_PRESETS.night, 6)
    // Monotone and inside the interval: every frame is an hour between the two.
    for (let i = 1; i < seen.length; i++) {
      expect(`${i}:${seen[i] >= seen[i - 1]}`).toBe(`${i}:true`)
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(TIME_PRESETS.day)
    expect(Math.max(...seen)).toBeLessThanOrEqual(TIME_PRESETS.night)
  })

  it('travels night to day through dawn, crossing midnight', () => {
    // The sweep the spec asks for by name. It has to wrap, so the hours are
    // not monotone as numbers — they run up to 24, reset, and climb to 10.
    const seen = play(TIME_PRESETS.night, TIME_PRESETS.day, 3)
    expect(seen[seen.length - 1]).toBeCloseTo(TIME_PRESETS.day, 6)
    expect(seen.some((h) => h > 22)).toBe(true)
    expect(seen.some((h) => h > 4 && h < 7)).toBe(true) // dawn was rendered
  })

  it('eases from where the world visibly is when interrupted', () => {
    // The defence against duelling tweens. A click part-way through an earlier
    // change must start from the hour on screen, not from where that change
    // began, or the scene jumps backwards before setting off again.
    const t = retargetHour(createHourTransition(10), 10, 21.5, 2)
    for (let i = 0; i < 30; i++) tickHour(t, 1 / 60)
    const interrupted = tickHour(t, 1 / 60)
    expect(interrupted).toBeGreaterThan(10)
    expect(interrupted).toBeLessThan(21.5)

    retargetHour(t, interrupted, 10, 2)
    expect(t.fromHour).toBeCloseTo(interrupted, 10)
    expect(t.done).toBe(false)
  })

  it('lands instantly on a zero duration', () => {
    // How reduced motion and the opening state are honoured — one code path,
    // not a second branch through the driver.
    const t = retargetHour(createHourTransition(10), 10, 21.5, 0)
    expect(t.done).toBe(true)
    expect(tickHour(t, 1 / 60)).toBeCloseTo(21.5, 10)
  })

  it('survives the whole idle span arriving as one delta', () => {
    // Under demand rendering the first frame after an idle spell reports every
    // second of it. Unclamped, that single frame would swallow the transition
    // and the change would read as a cut.
    const t = retargetHour(createHourTransition(10), 10, 21.5, 2)
    const afterIdle = tickHour(t, 5)
    expect(t.done).toBe(false)
    expect(t.elapsedS).toBeLessThanOrEqual(MAX_FRAME_DELTA_S)
    expect(afterIdle).toBeLessThan(11)
  })

  it('lands exactly on the target, not near it', () => {
    const seen = play(10, 15, 1, 1 / 30)
    expect(seen[seen.length - 1]).toBe(15)
  })
})
