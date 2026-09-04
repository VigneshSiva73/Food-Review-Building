import { useEffect, useState } from 'react'
import { uiConfig } from '@/config'

export type LayoutMode = 'mobile' | 'tablet' | 'desktop'

/** Pure breakpoint mapping (plan §31), so layout choices are unit-testable. */
export function computeLayoutMode(width: number): LayoutMode {
  if (width >= uiConfig.breakpoints.desktop) return 'desktop'
  if (width >= uiConfig.breakpoints.tablet) return 'tablet'
  return 'mobile'
}

/**
 * Current layout mode, tracking resizes. Each mode composes the same cards
 * differently — a docked panel, a slide-over, or a bottom sheet — rather than
 * shrinking one desktop layout.
 */
export function useResponsiveLayout(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    computeLayoutMode(typeof window === 'undefined' ? uiConfig.breakpoints.desktop : window.innerWidth),
  )

  useEffect(() => {
    const onResize = () => setMode(computeLayoutMode(window.innerWidth))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return mode
}
