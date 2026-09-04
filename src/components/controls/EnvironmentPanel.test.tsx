// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TIME_PRESETS } from '@/config'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { useDataStore } from '@/state/useDataStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'
import { EnvironmentPanel } from './EnvironmentPanel'

const RESET = {
  enabled: true,
  traffic: true,
  pedestrians: true,
  density: 'high' as const,
  hour: TIME_PRESETS.day,
  autoCycle: false,
}

beforeEach(() => useEnvironmentStore.setState(RESET))
afterEach(cleanup)

const env = () => useEnvironmentStore.getState()
const checked = (role: string, name: string) =>
  screen.getByRole(role, { name }).getAttribute('aria-checked')

describe('EnvironmentPanel', () => {
  it('drives the environment store', () => {
    render(<EnvironmentPanel />)

    fireEvent.click(screen.getByRole('radio', { name: 'Low' }))
    expect(env().density).toBe('low')

    fireEvent.click(screen.getByRole('switch', { name: 'Animate traffic' }))
    expect(env().traffic).toBe(false)

    fireEvent.click(screen.getByRole('switch', { name: 'Animate pedestrians' }))
    expect(env().pedestrians).toBe(false)

    fireEvent.click(screen.getByRole('switch', { name: 'Show the city' }))
    expect(env().enabled).toBe(false)
  })

  it('reports the current state to assistive technology', () => {
    useEnvironmentStore.setState({ density: 'medium', traffic: false })
    render(<EnvironmentPanel />)

    expect(checked('radio', 'Med')).toBe('true')
    expect(checked('switch', 'Animate traffic')).toBe('false')
    // Both states, not just the off one: an aria-checked hard-wired to false
    // still satisfies a test that only ever looks at something switched off.
    expect(checked('switch', 'Animate pedestrians')).toBe('true')
    expect(checked('switch', 'Show the city')).toBe('true')
  })

  it('sets the hour from the time control, and shows which one is on', () => {
    render(<EnvironmentPanel />)
    expect(checked('radio', 'Day')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: 'Night' }))
    expect(env().hour).toBe(TIME_PRESETS.night)
    expect(checked('radio', 'Night')).toBe('true')
    expect(checked('radio', 'Day')).toBe('false')
  })

  it('shows no preset as on while the hour sits between two', () => {
    // The hour is a continuous axis — a slider or the auto-cycle can leave it
    // anywhere. Rounding to the nearest preset would claim a look the scene is
    // not showing, so none of them lights up instead.
    useEnvironmentStore.setState({ hour: 12.5 })
    render(<EnvironmentPanel />)
    for (const name of ['Day', 'Afternoon', 'Night']) {
      expect(`${name}:${checked('radio', name)}`).toBe(`${name}:false`)
    }
  })

  it('scrubs the hour by half-hours', () => {
    // Half-hours, not whole ones: everything interesting happens between six
    // and half past nine in the evening, and whole hours step over most of it.
    render(<EnvironmentPanel />)
    const slider = screen.getByRole('slider', { name: 'Hour of day' })
    expect(slider.getAttribute('max')).toBe('47')
    fireEvent.change(slider, { target: { value: '39' } })
    expect(env().hour).toBe(19.5)
    expect(slider.getAttribute('aria-valuetext')).toBe('19:30')
  })

  it('stops the cycle the moment the viewer takes the wheel', () => {
    // Auto quietly dragging the scene off whatever was just chosen reads as the
    // control being broken rather than as a mode being on.
    useEnvironmentStore.setState({ autoCycle: true })
    render(<EnvironmentPanel />)
    fireEvent.click(screen.getByRole('radio', { name: 'Night' }))
    expect(env().autoCycle).toBe(false)

    useEnvironmentStore.setState({ autoCycle: true })
    fireEvent.change(screen.getByRole('slider', { name: 'Hour of day' }), {
      target: { value: '20' },
    })
    expect(env().autoCycle).toBe(false)
  })

  it('lets the cycle report its own progress without stopping itself', () => {
    // The driver writes the running hour back so the slider thumb creeps. That
    // path must not be mistaken for a viewer touching the control.
    useEnvironmentStore.setState({ autoCycle: true })
    useEnvironmentStore.getState().advanceHour(13.4)
    expect(env().hour).toBe(13.4)
    expect(env().autoCycle).toBe(true)
  })

  it('keeps the time control live when the city is switched off', () => {
    // The one row that is not a city setting. The hour lights the sky and the
    // tower, so grey it out with the city and it hides a control that still
    // does something.
    useEnvironmentStore.setState({ enabled: false })
    render(<EnvironmentPanel />)

    const night = screen.getByRole('radio', { name: 'Night' }) as HTMLButtonElement
    expect(night.disabled).toBe(false)
    fireEvent.click(night)
    expect(env().hour).toBe(TIME_PRESETS.night)
  })

  it('disables the rest when the city is switched off', () => {
    // Disabled rather than hidden, so the card does not resize under the
    // pointer and it stays obvious what turning the city back on restores.
    useEnvironmentStore.setState({ enabled: false })
    render(<EnvironmentPanel />)

    const disabled = (role: string, name: string) =>
      (screen.getByRole(role, { name }) as HTMLButtonElement).disabled
    expect(disabled('switch', 'Show the city')).toBe(false)
    for (const name of ['Animate traffic', 'Animate pedestrians']) {
      expect(`${name}:${disabled('switch', name)}`).toBe(`${name}:true`)
    }
    for (const name of ['Low', 'Med', 'High']) {
      expect(`${name}:${disabled('radio', name)}`).toBe(`${name}:true`)
    }
  })

  it('touches nothing outside the environment store', () => {
    // The separation the plan requires: no control on this card may reach the
    // dataset, the selection, or anything about the building.
    const before = {
      data: useDataStore.getState(),
      selection: useSelectionStore.getState(),
      view: useViewStore.getState(),
    }
    render(<EnvironmentPanel />)
    for (const name of ['Low']) {
      fireEvent.click(screen.getByRole('radio', { name }))
    }
    for (const name of ['Animate traffic', 'Show the city']) {
      fireEvent.click(screen.getByRole('switch', { name }))
    }

    expect(useDataStore.getState()).toBe(before.data)
    expect(useSelectionStore.getState()).toBe(before.selection)
    expect(useViewStore.getState()).toBe(before.view)
  })
})
