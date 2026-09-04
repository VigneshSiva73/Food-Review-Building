import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { CityBuildingSpec, HouseSpec } from '@/city'
import { noopRaycast } from '../instancing'
import { buildBuildingGeometry, type FacadeFamily } from './buildingGeometry'
import { cityFacadeMaterials, cityMaterials } from './cityResources'

/**
 * The neighbouring blocks (plan §9).
 *
 * One draw call per facade family plus one for every roof. Nothing here casts
 * into the hero's shadow map at a cost worth worrying about — the map is
 * frozen after a single render — but these buildings do receive the tower's
 * shadow, which is what plants it in the district rather than beside it.
 *
 * Raycasting is disabled on every mesh: the food-review data stays the only
 * thing in the scene you can click.
 */
export function CityBlocks({ specs, houses }: { specs: CityBuildingSpec[]; houses: HouseSpec[] }) {
  const merged = useMemo(() => buildBuildingGeometry(specs, houses), [specs, houses])
  const facadeMaterials = cityFacadeMaterials()
  const materials = cityMaterials()

  useLayoutEffect(
    () => () => {
      merged.facades.forEach((g) => g.dispose())
      merged.roofs.dispose()
    },
    [merged],
  )

  const families = useMemo(
    () => Array.from(merged.facades.entries()) as [FacadeFamily, THREE.BufferGeometry][],
    [merged],
  )

  if (specs.length === 0) return null

  return (
    <group name="city-blocks">
      {families.map(([family, geometry]) => (
        <mesh
          key={family}
          name={`city-facade-${family}`}
          geometry={geometry}
          material={facadeMaterials[family]}
          castShadow
          receiveShadow
          raycast={noopRaycast}
        />
      ))}
      <mesh
        name="city-roofs"
        geometry={merged.roofs}
        material={materials.roof}
        castShadow
        receiveShadow
        raycast={noopRaycast}
      />
    </group>
  )
}
