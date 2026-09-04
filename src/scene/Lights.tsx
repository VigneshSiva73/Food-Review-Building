import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { lightingConfig } from '@/config'
import { registerLights } from './timeOfDay/registry'

interface LightsProps {
  /** Horizontal bounding radius of the content, for shadow frustum fitting. */
  boundingRadius: number
  /** Total content height, for caster placement and shadow frustum. */
  totalHeight: number
  /** Shadow-map resolution (quality-tiered; defaults to the desktop size). */
  shadowMapSize?: number
  /**
   * How far open ground the shadow has to land on, if any.
   *
   * Outside the shadow camera's frustum three clamps the depth map to its edge
   * texel, so ground beyond it takes whatever that texel says — and where the
   * tower's own shadow touches the border, everything past it comes out fully
   * shadowed. That is a hard-edged black polygon lying across the plain, and it
   * appeared the moment the streets were extended far enough to see it.
   *
   * The tower is nine hundred units tall and the sun is at thirty-five degrees
   * at midday, so its shadow alone reaches past thirteen hundred.
   */
  shadowReach?: number
}

/**
 * One shadow-casting light + hemisphere ambient + non-shadow fill.
 *
 * Structure only. Every colour, intensity and position belongs to
 * `TimeOfDayDriver`, which reaches these three objects through the registry —
 * so this component declares no lighting values at all. That is not tidiness:
 * a prop carrying a colour re-commits the TARGET value whenever React renders
 * mid-sweep, and the scene flashes its destination for a frame.
 *
 * The shadow camera is fitted to the content bounds so shadow-map resolution
 * is never wasted, regardless of dataset size. Re-registering on a bounds
 * change is what makes the driver re-place the light against the new fit.
 */
export function Lights({
  boundingRadius,
  totalHeight,
  shadowMapSize = lightingConfig.shadow.mapSize,
  shadowReach = 0,
}: LightsProps) {
  const hemisphere = useRef<THREE.HemisphereLight>(null)
  const caster = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)

  // Orthographic shadow frustum covering the content AND the ground its shadow
  // falls on. Widening it costs resolution — the same map spread over more
  // ground — which is why it is fitted rather than simply made large.
  const frustum = Math.max(boundingRadius * 1.6, totalHeight * 0.75, shadowReach)

  useLayoutEffect(() => {
    if (!hemisphere.current || !caster.current || !fill.current) return
    return registerLights({
      hemisphere: hemisphere.current,
      caster: caster.current,
      fill: fill.current,
      boundingRadius,
      totalHeight,
    })
  }, [boundingRadius, totalHeight])

  return (
    <>
      <hemisphereLight ref={hemisphere} />
      <directionalLight
        ref={caster}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={lightingConfig.shadow.bias}
        shadow-normalBias={0.04}
        shadow-camera-left={-frustum}
        shadow-camera-right={frustum}
        shadow-camera-top={frustum}
        shadow-camera-bottom={-frustum}
        shadow-camera-near={1}
        shadow-camera-far={Math.max(boundingRadius, totalHeight) * 6}
      />
      <directionalLight ref={fill} />
    </>
  )
}
