import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { SkylineMass } from '@/city'
import { noopRaycast, writeInstances, type AnyTransform } from '../instancing'
import { cityMaterials, skylineGeometry } from './cityResources'

/**
 * The distant silhouette (plan §12).
 *
 * One InstancedMesh for the whole horizon. Instancing is right here where it
 * was wrong for the near blocks: these masses carry no facade texture, so
 * there are no UVs to stretch — they are pure silhouette, and fog plus
 * distance do all the remaining work.
 *
 * They neither cast nor receive shadows. The sun's shadow frustum is fitted to
 * the tower; nothing out here is inside it, and pretending otherwise would
 * spend shadow-map resolution on geometry that reads as a flat cut-out anyway.
 */
export function Skyline({ masses }: { masses: SkylineMass[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const materials = cityMaterials()

  const transforms = useMemo<AnyTransform[]>(
    () =>
      masses.map((m) => ({
        position: { x: m.position.x, y: 0, z: m.position.z },
        scale: { x: m.width, y: m.height, z: m.depth },
        rotY: m.rotationY,
      })),
    [masses],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    writeInstances(mesh, transforms)
  }, [transforms])

  if (masses.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      name="city-skyline"
      args={[skylineGeometry(), materials.skyline, masses.length]}
      raycast={noopRaycast}
      frustumCulled={false}
    />
  )
}
