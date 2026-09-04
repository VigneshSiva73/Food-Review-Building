// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StepSlider } from './StepSlider'

afterEach(cleanup)

describe('StepSlider', () => {
  const base = {
    min: 0,
    max: 12,
    value: 6,
    label: 'Month',
    valueText: 'June',
  }

  it('exposes a native slider with correct ARIA', () => {
    render(<StepSlider {...base} onChange={() => {}} />)
    const slider = screen.getByRole('slider', { name: 'Month' })
    expect(slider).toHaveProperty('value', '6')
    expect(slider.getAttribute('aria-valuetext')).toBe('June')
    expect(slider.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('renders one notch per step, marking muted ones', () => {
    const ticks = Array.from({ length: 13 }, (_, i) => ({
      value: i,
      muted: i > 0 && i < 6,
      title: i > 0 && i < 6 ? 'No data' : undefined,
    }))
    const { container } = render(<StepSlider {...base} ticks={ticks} onChange={() => {}} />)
    const notches = container.querySelectorAll('span[style*="left"]')
    expect(notches).toHaveLength(13)
    expect(container.querySelectorAll('[title="No data"]')).toHaveLength(5)
  })

  it('positions notches with the same thumb inset the browser uses', () => {
    // Without the inset the marks drift from the thumb toward the ends.
    const { container } = render(
      <StepSlider {...base} ticks={[{ value: 0 }, { value: 12 }]} onChange={() => {}} />,
    )
    const [first, last] = [...container.querySelectorAll('span[style*="left"]')].map(
      (el) => (el as HTMLElement).style.left,
    )
    // Both ends are expressed against the thumb radius and the doubled inset,
    // which is exactly how the browser lays out thumb travel.
    expect(first).toContain('8px')
    expect(last).toContain('16px')
    expect(last).toContain('100%')
    expect(first).not.toBe(last)
  })

  it('reports changes as numbers', () => {
    const onChange = vi.fn()
    render(<StepSlider {...base} onChange={onChange} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '9' } })
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('marks vertical orientation for assistive tech', () => {
    render(<StepSlider {...base} orientation="vertical" lengthPx={200} onChange={() => {}} />)
    expect(screen.getByRole('slider').getAttribute('aria-orientation')).toBe('vertical')
  })
})
