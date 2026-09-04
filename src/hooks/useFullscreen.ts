import { useCallback, useEffect, useState } from 'react'

/** Fullscreen toggle for the whole app, tracking external exits (Esc). */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // Not supported (e.g. iPhone Safari) — silently ignore.
      })
    }
  }, [])

  return { isFullscreen, toggle }
}
