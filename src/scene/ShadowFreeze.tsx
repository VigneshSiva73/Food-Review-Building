import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * Shadow maps are expensive to re-render every frame but our sun and
 * building are static, so shadows render once per content change and are
 * frozen otherwise (plan §32). `contentKey` must change whenever shadow
 * casters change (layout identity); the construction animator (Phase 13)
 * temporarily re-enables auto-update while geometry is in motion.
 */
export function ShadowFreeze({ contentKey }: { contentKey: unknown }) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    // oxlint-disable-next-line react/immutability -- three.js renderer state is inherently mutable; this is the documented way to freeze shadow maps.
    gl.shadowMap.autoUpdate = false
    // oxlint-disable-next-line react/immutability
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, contentKey])

  return null
}
