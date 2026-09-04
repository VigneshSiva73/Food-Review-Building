import { useLayoutEffect, useMemo } from 'react'
import { buildGroundCover, buildGroundPlan, type CityLayout } from '@/city'
import { noopRaycast } from '../instancing'
import { cityMaterials, GROUND_LAYERS } from './cityResources'
import { patchesToGeometry, quadsToGeometry, slabsToGeometry } from './mergeGround'

/**
 * The urban ground: terrain disc, asphalt, painted lines, walkways with kerbs,
 * the hero's plaza (plan §§6–8).
 *
 * Six draw calls for the entire street surface — each layer is one merged
 * buffer. Every mesh opts out of raycasting so the city can never intercept a
 * click meant for the building, and none of it casts a shadow: the sun's
 * shadow map is frozen and budgeted for the tower alone.
 */
export function CityGround({
  layout,
  island,
  cover,
}: {
  layout: CityLayout
  island: boolean
  /** Grass on the blocks nothing is built on; off with the buildings. */
  cover: boolean
}) {
  const materials = cityMaterials()

  const plan = useMemo(() => buildGroundPlan(layout, GROUND_LAYERS), [layout])

  const geometries = useMemo(
    () => ({
      asphalt: quadsToGeometry(plan.asphalt),
      markings: quadsToGeometry(plan.markings),
      walkways: slabsToGeometry(plan.walkways),
      plaza: slabsToGeometry([plan.plaza]),
      cover: patchesToGeometry(cover ? buildGroundCover() : []),
    }),
    [plan, cover],
  )

  useLayoutEffect(
    () => () => {
      for (const geom of Object.values(geometries)) geom.dispose()
    },
    [geometries],
  )

  return (
    <group name="city-ground">
      {/* The city's own ground disc, drawn only when nothing else carries the
          ground. With the island on, its terrain is exactly flat across the
          whole city footprint, and this disc would be a grey circle lying on
          top of a coastline. */}
      {!island && (
        <mesh
          name="city-terrain"
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, GROUND_LAYERS.terrain, 0]}
          material={materials.terrain}
          receiveShadow
          raycast={noopRaycast}
        >
          <circleGeometry args={[layout.groundRadius, 96]} />
        </mesh>
      )}

      <mesh
        name="city-asphalt"
        geometry={geometries.asphalt}
        material={materials.asphalt}
        receiveShadow
        raycast={noopRaycast}
      />
      <mesh
        name="city-markings"
        geometry={geometries.markings}
        material={materials.marking}
        raycast={noopRaycast}
      />
      <mesh
        name="city-walkways"
        geometry={geometries.walkways}
        material={materials.sidewalk}
        receiveShadow
        raycast={noopRaycast}
      />
      <mesh
        name="city-plaza"
        geometry={geometries.plaza}
        material={materials.plaza}
        receiveShadow
        raycast={noopRaycast}
      />
      {/* Grass, and the only ground layer that is not a street. Without it a
          park is the same bare shelf the roads stand on, with trees on it. */}
      <mesh
        name="city-ground-cover"
        geometry={geometries.cover}
        material={materials.cover}
        receiveShadow
        raycast={noopRaycast}
      />
    </group>
  )
}
