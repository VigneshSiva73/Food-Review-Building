import { describe, expect, it } from 'vitest'
import { DEFAULT_HOUR, TIME_PRESETS } from '@/config'
import { requestedHour, useEnvironmentStore } from './useEnvironmentStore'

describe('requestedHour', () => {
  it('reads an hour off the query string', () => {
    expect(requestedHour('?hour=21.5')).toBe(21.5)
    expect(requestedHour('?hour=0')).toBe(0)
    expect(requestedHour('?days=300&hour=6.25')).toBe(6.25)
  })

  it('accepts the preset names as well as numbers', () => {
    // A link to "the tower at dusk" should not have to know that dusk is 21.5.
    expect(requestedHour('?hour=night')).toBe(TIME_PRESETS.night)
    expect(requestedHour('?hour=day')).toBe(TIME_PRESETS.day)
    expect(requestedHour('?hour=afternoon')).toBe(TIME_PRESETS.afternoon)
  })

  it('ignores anything it cannot use rather than guessing', () => {
    // A typo should open the app normally, not at some hour nobody chose —
    // clamping 99 to 24 would silently show midnight and look like a bug.
    for (const search of ['', '?hour=', '?hour=lunchtime', '?hour=25', '?hour=-1', '?hour=NaN']) {
      expect(`${search}:${requestedHour(search)}`).toBe(`${search}:null`)
    }
  })
})

describe('environment store hour', () => {
  it('opens on the default hour', () => {
    expect(useEnvironmentStore.getState().hour).toBe(DEFAULT_HOUR)
  })

  it('setPreset moves to that preset hour', () => {
    useEnvironmentStore.getState().setPreset('night')
    expect(useEnvironmentStore.getState().hour).toBe(TIME_PRESETS.night)
    useEnvironmentStore.getState().setPreset('day')
    expect(useEnvironmentStore.getState().hour).toBe(TIME_PRESETS.day)
  })

  it('setHour takes any point on the axis, not just the presets', () => {
    // The presets are three stops on a continuous control, not the whole of it.
    useEnvironmentStore.getState().setHour(6.25)
    expect(useEnvironmentStore.getState().hour).toBe(6.25)
    useEnvironmentStore.getState().setHour(DEFAULT_HOUR)
  })
})

describe('jumping to an hour', () => {
  it('arrives in one step, where setting sweeps', () => {
    // The sweep runs along the hour axis, so morning to night passes through
    // the afternoon and looks like it. That is right for the time control,
    // where the hour is the subject — and wrong for a click on a dinner
    // column, where the two hours in between are a delay before the answer.
    useEnvironmentStore.getState().setHour(TIME_PRESETS.day)
    expect(useEnvironmentStore.getState().hourJump).toBe(false)

    useEnvironmentStore.getState().jumpToHour(TIME_PRESETS.night)
    expect(useEnvironmentStore.getState().hour).toBe(TIME_PRESETS.night)
    expect(useEnvironmentStore.getState().hourJump).toBe(true)
  })

  it('clears the jump again on the next ordinary change', () => {
    // Otherwise one click on a column would leave every later move of the time
    // control snapping instead of sweeping.
    useEnvironmentStore.getState().jumpToHour(TIME_PRESETS.night)
    useEnvironmentStore.getState().setHour(TIME_PRESETS.day)
    expect(useEnvironmentStore.getState().hourJump).toBe(false)

    useEnvironmentStore.getState().jumpToHour(TIME_PRESETS.night)
    useEnvironmentStore.getState().setPreset('afternoon')
    expect(useEnvironmentStore.getState().hourJump).toBe(false)

    // And the cycle's own progress reports never make the scene snap.
    useEnvironmentStore.getState().jumpToHour(TIME_PRESETS.night)
    useEnvironmentStore.getState().advanceHour(12)
    expect(useEnvironmentStore.getState().hourJump).toBe(false)
  })

  it('stops the cycle, as any hand on the clock does', () => {
    useEnvironmentStore.setState({ autoCycle: true })
    useEnvironmentStore.getState().jumpToHour(TIME_PRESETS.night)
    expect(useEnvironmentStore.getState().autoCycle).toBe(false)
  })
})
