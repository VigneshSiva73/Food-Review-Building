import { useLayoutEffect, useMemo } from 'react'
import type { CivicFacility, Playground, ThemePark } from '@/city'
import { noopRaycast } from '../instancing'
import { attractionGeometry } from './attractionGeometry'
import { cityMaterials } from './cityResources'

/**
 * The theme park's rides.
 *
 * One mesh for the whole fairground: every ride is merged into a single
 * vertex-coloured buffer, which is the last draw call the environment has.
 * They cast into the frozen shadow map like the buildings do — a ferris wheel
 * without a shadow reads as a decal on the grass.
 */
export function Attractions({
  park,
  facilities,
  playgrounds,
}: {
  park: ThemePark | null
  facilities: CivicFacility[]
  playgrounds: Playground[]
}) {
  const geometry = useMemo(
    () => attractionGeometry(park, facilities, playgrounds),
    [park, facilities, playgrounds],
  )
  const materials = cityMaterials()

  useLayoutEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null
  return (
    <mesh
      name="city-attractions"
      geometry={geometry}
      material={materials.attraction}
      castShadow
      receiveShadow
      raycast={noopRaycast}
    />
  )
}
