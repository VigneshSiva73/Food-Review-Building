import { useEffect, useMemo } from 'react'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { useThree } from '@react-three/fiber'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { islandConfig } from '@/config/islandConfig'
import { heightField } from '@/terrain/heightField'
import { getQualityTier } from '@/utils/quality'
import { noopRaycast } from '../instancing'
import { disposeIslandResources, islandMaterials, OCEAN_HALF } from './islandResources'
import { applyOceanWaves } from './oceanWaves'
import { buildTerrainMesh } from './terrainMesh'
import { buildOceanMeshes } from './oceanMesh'
import { buildRivers } from '@/terrain/rivers'
import { buildWaterfalls } from '@/terrain/waterfalls'
import { buildWaterfallMeshes } from './waterfallMesh'
import { buildRiverMesh } from './riverMesh'
import { Vegetation } from './Vegetation'
import { Settlements } from './Settlements'
import { Rocks } from './Rocks'
import { Boats } from './Boats'
import { buildCityAccess } from '@/terrain/cityAccess'
import { buildRoads, smoothRoad } from '@/terrain/roads'
import { buildTrails } from '@/terrain/trails'
import { buildSettlements } from '@/terrain/settlements'
import { buildRoadMesh, buildTrailMesh } from './roadMesh'

/**
 * The land and the sea the city stands on.
 *
 * Composed beside `Building` and `CityEnvironment` in the viewport, never
 * inside either: the tower is the data visualisation, the city is its setting,
 * and the island is the ground both of them happen to be on. It knows nothing
 * about the food-review data.
 */

export function IslandEnvironment() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const mats = islandMaterials()
  // The island's villages are buildings too, and go with the city's.
  const showBuildings = useEnvironmentStore((s) => s.buildings)

  const resolution = useMemo(() => {
    // The silhouette survives a coarser mesh; only the fine relief goes. Keyed
    // off the same signal that already decides city density.
    return getQualityTier().cityDensity === 'low' ? 145 : 241
  }, [])

  const field = useMemo(() => heightField(), [])
  const terrain = useMemo(() => buildTerrainMesh(field, resolution), [field, resolution])
  const riverPaths = useMemo(() => buildRivers(field), [field])
  const rivers = useMemo(() => buildRiverMesh(riverPaths), [riverPaths])
  const routes = useMemo(() => {
    const places = buildSettlements(field)
    // The island's roads may only enter the city along its streets, so they
    // arrive at a junction rather than stopping on the edge of the plain.
    const network = buildRoads(field, places, undefined, buildCityAccess(field))
    // Trails start FROM the finished roads, which is what a trailhead is.
    const paths = buildTrails(field, network, buildWaterfalls(buildRivers(field)))
    return {
      roads: buildRoadMesh(network.map((road) => smoothRoad(road))),
      trails: buildTrailMesh(paths.map((path) => smoothRoad(path))),
    }
  }, [field])
  const falls = useMemo(() => buildWaterfallMeshes(buildWaterfalls(riverPaths)), [riverPaths])
  // The shallow sheet only needs vertices where the seabed changes, so it is
  // built over the island's own extent and the horizon is one big plane.
  const seaResolution = useMemo(
    () => (getQualityTier().cityDensity === 'low' ? 96 : 160),
    [],
  )
  const ocean = useMemo(
    () => buildOceanMeshes(field, seaResolution, OCEAN_HALF),
    [field, seaResolution],
  )

  useEffect(() => {
    const geometry = terrain.geometry
    return () => geometry.dispose()
  }, [terrain])
  useEffect(
    () => () => {
      ocean.shallow.dispose()
      ocean.deep.dispose()
    },
    [ocean],
  )
  useEffect(() => {
    const geometry = rivers.geometry
    return () => geometry.dispose()
  }, [rivers])
  useEffect(() => {
    const { roads, trails } = routes
    return () => {
      roads.geometry.dispose()
      trails.geometry.dispose()
    }
  }, [routes])
  useEffect(() => {
    const { sheet, pool } = falls
    return () => {
      sheet.dispose()
      pool.dispose()
    }
  }, [falls])
  useEffect(() => {
    // The waterfall's map scrolls downward, and the sea's clock advances.
    // Registered on the SHARED frame loop rather than opening one of its own,
    // so they move only while the world already is — with everything switched
    // off the falls hold still and the renderer sleeps, which is the app's
    // standing bargain.
    const map = mats.waterfall.map
    // The swell's own clock. It starts at a rest phase rather than zero, so
    // this ADDS to it rather than setting it: a frozen sea keeps the shape it
    // was already holding instead of snapping back to flat.
    const waves = applyOceanWaves(mats.shallow)
    return registerFrameSystem((_, elapsedMs) => {
      const t = elapsedMs / 1000
      if (map) map.offset.y = -t * 0.85
      waves.uTime.value = islandConfig.ocean.restPhase + t * islandConfig.ocean.speed
    })
  }, [mats])

  useEffect(() => () => disposeIslandResources(), [])

  useEffect(() => {
    // The sun's shadow map is rendered once and frozen. Putting an island under
    // the city changes what receives that shadow, so it has to be drawn again.
    // oxlint-disable-next-line react/immutability -- three.js renderer state is mutable by design.
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, terrain, ocean])

  return (
    <group name="island">
      {/*
        Receives the tower's shadow, never casts one: the shadow frustum is
        fitted to the building and frozen, so ground this size would spend the
        whole map on empty hillside and drag a stale shadow behind it.

        Raycasting is off on both. A hit on the sea would swallow the
        `onPointerMissed` that clears the building selection.
      */}
      <mesh
        name="island-terrain"
        geometry={terrain.geometry}
        material={mats.terrain}
        receiveShadow
        castShadow={false}
        raycast={noopRaycast}
      />
      {/* Deep water first and slightly lower, so the graded sheet above it is
          never fighting it for depth. */}
      <mesh
        name="island-deep"
        geometry={ocean.deep}
        material={mats.deep}
        position={[0, islandConfig.world.seaLevel - 2, 0]}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      <mesh
        name="island-shallow"
        geometry={ocean.shallow}
        material={mats.shallow}
        position={[0, islandConfig.world.seaLevel, 0]}
        renderOrder={2}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      {/* Drawn after the land and before the trees, sitting a little above the
          bed the carve already cut — the water is IN its valley rather than a
          tube laid over the ground. */}
      <mesh
        name="island-rivers"
        geometry={rivers.geometry}
        material={mats.river}
        renderOrder={1}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      <mesh
        name="island-waterfall-pools"
        geometry={falls.pool}
        material={mats.pool}
        renderOrder={2}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      <mesh
        name="island-waterfalls"
        geometry={falls.sheet}
        material={mats.waterfall}
        renderOrder={3}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      {/* Under the buildings and over the ground, so a village's streets read
          as running between its houses. */}
      <mesh
        name="island-roads"
        geometry={routes.roads.geometry}
        material={mats.road}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      <mesh
        name="island-trails"
        geometry={routes.trails.geometry}
        material={mats.trail}
        receiveShadow={false}
        castShadow={false}
        raycast={noopRaycast}
      />
      {showBuildings && <Settlements />}
      <Boats />
      <Rocks />
      <Vegetation />
    </group>
  )
}
