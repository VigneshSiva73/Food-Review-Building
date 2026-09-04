import { describe, expect, it } from 'vitest'
import { uiConfig } from '@/config'
import { computeLayoutMode } from './useResponsiveLayout'

describe('computeLayoutMode', () => {
  it('maps common device widths to the intended layout', () => {
    expect(computeLayoutMode(375)).toBe('mobile') // iPhone SE / mini
    expect(computeLayoutMode(430)).toBe('mobile')
    expect(computeLayoutMode(768)).toBe('tablet') // iPad portrait
    expect(computeLayoutMode(1024)).toBe('tablet') // iPad landscape
    expect(computeLayoutMode(1280)).toBe('desktop')
    expect(computeLayoutMode(1920)).toBe('desktop')
  })

  it('switches exactly at the configured breakpoints', () => {
    const { tablet, desktop } = uiConfig.breakpoints
    expect(computeLayoutMode(tablet - 1)).toBe('mobile')
    expect(computeLayoutMode(tablet)).toBe('tablet')
    expect(computeLayoutMode(desktop - 1)).toBe('tablet')
    expect(computeLayoutMode(desktop)).toBe('desktop')
  })

  it('degrades gracefully for absurd widths', () => {
    expect(computeLayoutMode(0)).toBe('mobile')
    expect(computeLayoutMode(10_000)).toBe('desktop')
  })
})
