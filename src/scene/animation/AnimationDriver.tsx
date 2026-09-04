import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MAX_FRAME_DELTA_S, prefersReducedMotion } from '@/utils/motion'
import { tickFrameSystems } from '@/scene/animation/frameSystems'

/**
 * The city's only frame loop (plan §18).
 *
 * The renderer runs on `frameloop="demand"`, so a frame happens only when
 * something asks for one. While the city is moving this asks every frame; the
 * moment it stops, it stops asking and the renderer settles back to idle. That
 * is what keeps a static city genuinely free rather than merely cheap.
 *
 * Three things pause it: the viewer turning traffic off, the tab going into
 * the background, and a reduced-motion preference. The first two are live —
 * coming back to the tab resumes — while reduced motion is read once, since a
 * viewer who asked the OS for less animation should not have the page start
 * moving underneath them mid-session.
 */
export function AnimationDriver({ active }: { active: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const elapsedRef = useRef(0)
  const [hidden, setHidden] = useState(() =>
    typeof document === 'undefined' ? false : document.hidden,
  )
  const [reduced] = useState(prefersReducedMotion)

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const running = active && !hidden && !reduced

  // Kick the demand loop when animation resumes; without this the first frame
  // never arrives and the city stays frozen until something else invalidates.
  useEffect(() => {
    if (running) invalidate()
  }, [running, invalidate])

  useFrame((_, delta) => {
    if (!running) return
    // The demand loop reports the whole idle span as the first delta after a
    // pause, so this has to be clamped or resuming would teleport the fleet.
    const dt = Math.min(delta, MAX_FRAME_DELTA_S)
    elapsedRef.current += dt * 1000
    tickFrameSystems(dt, elapsedRef.current)
    invalidate()
  })

  return null
}
