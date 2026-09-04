import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import {
  buildAllRouteStops,
  buildCityBuildings,
  buildFacilities,
  buildPlaygrounds,
  buildThemePark,
  civicBuildings,
  buildBlockTrees,
  buildHouses,
  buildCityLayout,
  buildCityPaths,
  buildPedestrianNetwork,
  buildPedestrians,
  buildSignalPosts,
  buildSkyline,
  buildStreetProps,
  buildVehicles,
} from '@/city'
import { getQualityTier } from '@/utils/quality'
import { Attractions } from './Attractions'
import { CityBlocks } from './CityBlocks'
import { CityGround } from './CityGround'
import { Greenery } from './Greenery'
import { Skyline } from './Skyline'
import { Pedestrians } from './Pedestrians'
import { StreetFurniture } from './StreetFurniture'
import { Traffic } from './Traffic'
import { TrafficSignals } from './TrafficSignals'
import { disposeCityResources, GROUND_LAYERS } from './cityResources'
import { registerCityMaterials } from '@/scene/timeOfDay/registry'

/**
 * Root of the city environment and the owner of its lifecycle (plan §48).
 *
 * The layout is generated once from the seeded pure layer, so the district is
 * identical on every refresh. Shared GPU resources are released when the whole
 * environment unmounts — toggling the city off must not leak.
 *
 * This component deliberately knows nothing about the food-review data: it is
 * composed alongside the building in `Viewport`, never inside it.
 */
export function CityEnvironment() {
  const layout = useMemo(() => buildCityLayout(), [])
  const density = useEnvironmentStore((s) => s.density)
  // The island carries the ground when it is on, so the city's own disc stands
  // down rather than being drawn on top of a coastline.
  const island = useEnvironmentStore((s) => s.island)
  const showBuildings = useEnvironmentStore((s) => s.buildings)
  // Both rings merge into the same buffers: the mid ring adds ~1k triangles
  // and no draw calls at all, and keeps its facades correctly scaled rather
  // than stretched, which a separate instanced LOD would not.
  const blocks = useMemo(
    // The hospital, the schools and the shopping centre are chosen rather than
    // generated, but they are buildings like any other once placed — same
    // merger, same materials, no extra draw call.
    () => [...buildCityBuildings(layout, density), ...civicBuildings()],
    [layout, density],
  )
  // The suburbs are laid out along block edges rather than on plots, so they
  // are generated separately — and merged into the same buffers, which is why
  // two thousand houses cost no extra draw calls.
  const houses = useMemo(() => buildHouses(), [])
  // Back gardens, parks and vacant land. Instanced with the street trees, so
  // filling every empty block costs nothing but triangles.
  const blockTrees = useMemo(() => buildBlockTrees(density), [density])
  const themePark = useMemo(() => buildThemePark(), [])
  const facilities = useMemo(() => buildFacilities(), [])
  const playgrounds = useMemo(() => buildPlaygrounds(), [])
  const skyline = useMemo(() => buildSkyline(density), [density])
  // Props stand on the paving, not the terrain, so they take their base height
  // from the same ground layers CityGround builds the kerbs from.
  const streetProps = useMemo(
    () => buildStreetProps(layout, density, GROUND_LAYERS),
    [layout, density],
  )
  const greenery = useMemo(
    () => [...streetProps.trees, ...(showBuildings ? blockTrees : [])],
    [streetProps, blockTrees, showBuildings],
  )
  const trafficOn = useEnvironmentStore((s) => s.traffic)
  const pedestriansOn = useEnvironmentStore((s) => s.pedestrians)
  const quality = useMemo(() => getQualityTier(), [])
  // Routes, stop lines and the fleet are all fixed for the life of the city;
  // only the vehicles' positions change, and those live in typed arrays inside
  // `Traffic` rather than in React state.
  const paths = useMemo(() => buildCityPaths(), [])
  const routeStops = useMemo(
    () => buildAllRouteStops(paths.vehicleRoutes, paths.signals),
    [paths],
  )
  const vehicles = useMemo(
    () => buildVehicles(paths.vehicleRoutes, quality.vehicles),
    [paths, quality],
  )
  const pedestrianNetwork = useMemo(() => buildPedestrianNetwork(paths.signals), [paths])
  const people = useMemo(
    () => buildPedestrians(pedestrianNetwork, quality.pedestrians),
    [pedestrianNetwork, quality],
  )
  const signalPosts = useMemo(() => buildSignalPosts(paths.signals), [paths])
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  // The sun's shadow map is frozen after its one render. Adding the ground
  // changes what receives that shadow, so it has to be redrawn once.
  useEffect(() => {
    // oxlint-disable-next-line react/immutability -- three.js renderer state is mutable by design.
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, invalidate, layout, blocks, houses, streetProps])

  // Announced once on mount, never keyed to the hour.
  //
  // A second writer keyed to the hour snaps the city to the TARGET the instant
  // a transition begins, so the cross-fade plays out on the tower while the
  // streets have already arrived. The driver owns the blend; this only says
  // "the materials exist now, come and write them".
  useEffect(() => registerCityMaterials(), [])

  useEffect(() => () => disposeCityResources(), [])

  return (
    <group name="city">
      <CityGround layout={layout} island={island} cover={showBuildings} />
      {/* Every building but the Food Building can stand down, leaving the
          streets and the tower alone — which is the state to lay a new city
          out from. */}
      {showBuildings && <CityBlocks specs={blocks} houses={houses} />}
      {showBuildings && (
        <Attractions park={themePark} facilities={facilities} playgrounds={playgrounds} />
      )}
      <Greenery trees={greenery} />
      <StreetFurniture props={streetProps.furniture} />
      {/* The far skyline exists to imply a bigger city beyond the modelled
          streets when you are standing in them, and to dissolve into the fog at
          the ground disc's rim. With the island on it does neither job: there
          is real land out there instead, and from above the ring reads as a
          wall of blank grey boxes around the city. */}
      {!island && <Skyline masses={skyline} />}
      <Traffic
        vehicles={vehicles}
        routes={paths.vehicleRoutes}
        stops={routeStops}
        signals={paths.signals}
        animate={trafficOn}
      />
      <Pedestrians
        people={people}
        network={pedestrianNetwork}
        signals={paths.signals}
        animate={pedestriansOn}
      />
      <TrafficSignals posts={signalPosts} signals={paths.signals} />
      {/* One loop serves both fleets; it runs while either is switched on. */}
    </group>
  )
}
