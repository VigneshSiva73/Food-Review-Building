import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useRuntimeStore } from '@/state/useRuntimeStore'

/**
 * Watches for GPU context loss (plan §33). Calling preventDefault lets the
 * browser attempt an automatic restore; until it succeeds an overlay explains
 * what happened rather than leaving a frozen or blank canvas.
 */
export function ContextLossWatcher() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (e: Event) => {
      e.preventDefault()
      console.warn('[scene] WebGL context lost; awaiting restore')
      useRuntimeStore.getState().setContextLost(true)
    }
    const onRestored = () => {
      console.info('[scene] WebGL context restored')
      useRuntimeStore.getState().setContextLost(false)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl])

  return null
}
