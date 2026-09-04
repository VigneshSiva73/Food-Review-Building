import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import {
  animationConfig,
  buildingConfig,
  cameraConfig,
  islandConfig,
  lightingConfig,
  INITIAL_BACKGROUND,
  moduleHeight,
} from '@/config'
import { applyExplode } from '@/building/explode'
import { plateRadius } from '@/building'
import { districtReach, districtShadowReach } from '@/city'
import { IslandEnvironment } from './island/IslandEnvironment'
import { monthIsComplete, visibleFloorCount } from '@/building/monthFilter'
import { useAnimationStore } from '@/state/useAnimationStore'
import { useDataStore } from '@/state/useDataStore'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useFilterStore } from '@/state/useFilterStore'
import { isoToDisplay } from '@/utils/date'
import { indexedRef } from '@/types/selection'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'
import { useEasedValue } from '@/hooks/useEasedValue'
import { getQualityTier } from '@/utils/quality'
import { Building } from './Building'
import { CityEnvironment } from './city/CityEnvironment'
import { ContextLossWatcher } from './ContextLossWatcher'
import { CameraRig, type FocusPoint } from './CameraRig'
import { demoFloor } from './demoFloors'
import { EnvironmentLight } from './EnvironmentLight'
import { Ground } from './Ground'
import { Lights } from './Lights'
import { ShadowFreeze } from './ShadowFreeze'
import { AnimationDriver } from './animation/AnimationDriver'
import { TimeOfDayDriver } from './timeOfDay/TimeOfDayDriver'
import { SkyDome } from './sky/SkyDome'
import { Stars } from './sky/Stars'
import { Clouds } from './sky/Clouds'
import { Aircraft } from './sky/Aircraft'

/**
 * Fog constructor arguments, hoisted so their identity never changes.
 *
 * R3F rebuilds an `attach`ed object when its `args` array changes identity, and
 * the driver writes the live fog colour straight onto the Fog instance — a
 * rebuild would silently discard it and leave the haze one hour behind. The
 * colour here is only what the object is constructed with; it is overwritten
 * before the first frame.
 */
const FOG_ARGS: [number, number, number] = [0x000000, 1, 2]

/**
 * The 3D viewport. Content bounds come from the layout solver so camera,
 * lights, and fog adapt to any dataset size (plan §§24–25).
 *
 * Renders the complete building, optionally
 * exploded for floor inspection. A `?demo=equal|spread|saturday` fixture
 * floor is kept for joint debugging.
 */
export function Viewport() {
  const layout = useDisplayedLayout()
  const dayLimit = useFilterStore((s) => s.dayLimit)
  const autoRotate = useViewStore((s) => s.autoRotate)
  const showDetails = useViewStore((s) => s.showDetails)
  const explode = useViewStore((s) => s.explode)
  const resetSignal = useViewStore((s) => s.resetSignal)
  const focusRequest = useViewStore((s) => s.focusRequest)
  const islandViewSignal = useViewStore((s) => s.islandViewSignal)
  const cityEnabled = useEnvironmentStore((s) => s.enabled)
  const islandEnabled = useEnvironmentStore((s) => s.island)
  const trafficOn = useEnvironmentStore((s) => s.traffic)
  const pedestriansOn = useEnvironmentStore((s) => s.pedestrians)
  const autoCycle = useEnvironmentStore((s) => s.autoCycle)
  /**
   * The single condition for whether anything animates.
   *
   * Cloud drift and star twinkle ride inside this loop rather than opening one
   * of their own — free when it is already running, absent when it is not. So
   * with traffic and pedestrians off the sky is STILL: a beautiful stopped
   * picture, and the renderer sleeps exactly as it did before any of this
   * existed. That was a deliberate choice over an always-on low-rate tick,
   * which would have traded the app's zero-idle-cost promise for drift nobody
   * asked to pay for.
   *
   * The auto-cycle is the one thing that may run the loop by itself, because
   * it is an explicit request and would be meaningless otherwise.
   */
  const worldMoving = autoCycle || (cityEnabled && (trafficOn || pedestriansOn))

  const demo = useMemo(
    () => demoFloor(new URLSearchParams(window.location.search).get('demo') ?? ''),
    [],
  )
  const showStats = useMemo(
    () => new URLSearchParams(window.location.search).has('stats'),
    [],
  )
  const quality = useMemo(() => getQualityTier(), [])

  // Animated floor separation; 0 returns the solver layout untouched.
  const explodeFactor = useEasedValue(explode ? 1 : 0, animationConfig.explodeMs)
  const exploded = useMemo(
    () => (layout ? applyExplode(layout, buildingConfig.explodeGap * explodeFactor) : null),
    [layout, explodeFactor],
  )

  // Stable identities: these feed memos and the construction registry, which
  // would otherwise rebuild on every render.
  const floors = useMemo(
    () => (demo ? [demo] : (exploded?.floors ?? [])),
    [demo, exploded],
  )
  // Day slider: everything up to the cap is clad, everything above it reverts
  // to bare frame — so dragging the slider reads as construction progress.
  const maxVisibleFloors = demo ? Infinity : visibleFloorCount(floors, dayLimit)

  /**
   * Whether this month is finished, and so whether the tower is crowned.
   *
   * Read off the whole dataset rather than the displayed layout: the day
   * slider slices the building, but slicing it does not un-finish the month,
   * and a crown that vanished halfway down the slider would read as a bug.
   */
  const days = useDataStore((s) => s.dataset?.days)
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)
  const crowned =
    !demo && !!days && year !== null && month !== null && monthIsComplete(days, { year, month })

  const boundingRadius = layout?.radius ?? 10
  // Camera/light bounds track the explode TARGET state (not the per-frame
  // animation), so the camera glides once per toggle instead of re-fitting
  // every frame.
  const fitHeight = demo
    ? demo.deckY
    : Math.max(
        (layout?.totalHeight ?? 0) +
          (explode ? Math.max(0, (layout?.floors.length ?? 1) - 1) * buildingConfig.explodeGap : 0) +
          // The spire stands above the last plate, and the camera frames the
          // building by this number — leave it out and the point is cropped
          // off the top of the opening shot.
          (crowned ? buildingConfig.crown.height : 0),
        moduleHeight(),
      )

  const focus = useMemo<FocusPoint | null>(() => {
    if (!focusRequest || !exploded) return null
    const { ref, nonce } = focusRequest
    const reach = cameraConfig.focus
    // A floor plate is far wider than it is tall, so frame it against the
    // plate radius; a single pillar is framed against the module height.
    const plateDistance = plateRadius() * reach.plateRadiusFactor

    // Focus is a request to frame one PART of the building. There is nothing
    // to fly to for a whole-tower reference — the default camera already
    // frames the tower — so those are simply not focus targets.
    const at = indexedRef(ref)
    if (!at) return null

    const floor = exploded.floors[at.floorIndex]
    if (!floor) return null

    if (at.kind === 'pillar') {
      // Aim at the middle of the pillar itself so it fills the view.
      const p = floor.pillars[at.corner]
      return {
        point: [p.base.x, p.base.y + p.height / 2, p.base.z],
        distance: reach.pillarDistanceModules * moduleHeight(),
        nonce,
      }
    }

    const [a, b, d] = floor.slab.corners
    return {
      point: [(a.x + b.x + d.x) / 3, (floor.baseY + floor.deckY) / 2, (a.z + b.z + d.z) / 3],
      distance: plateDistance,
      nonce,
    }
    // Recompute only per request — not per explode animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest])

  const stats = useDataStore((s) => s.dataset?.stats ?? null)
  const description = stats
    ? `3D building visualising office food reviews: ${stats.totalDays} floors, one per working day ` +
      `from ${isoToDisplay(stats.dateRange?.start ?? '')} to ${isoToDisplay(stats.dateRange?.end ?? '')}. ` +
      `Each floor has three pillars whose heights are the day's Breakfast, Lunch, and Dinner ratings. ` +
      `Average ratings: Breakfast ${stats.perMeal.Breakfast.average.toFixed(2)}, ` +
      `Lunch ${stats.perMeal.Lunch.average.toFixed(2)}, Dinner ${stats.perMeal.Dinner.average.toFixed(2)} out of 5. ` +
      `Full details are listed in the building information panel.`
    : 'Interactive 3D building generated from food review data'

  const fog = lightingConfig.fog
  // Haze is keyed to the tower's height, which shrinks as the day filter
  // narrows, so the band stays in proportion to whatever is on screen.
  // Haze is keyed to the tower's height, which shrinks as the day filter
  // narrows. The district is a fixed size, so with the city on the fog keys to
  // whichever is larger — otherwise viewing a handful of days buries the
  // streets in white.
  const fogReference = cityEnabled ? Math.max(fitHeight, districtReach()) : fitHeight
  // With the island on, haze takes an absolute floor as well. The reference
  // above drops to 540 when the month filter shows a handful of floors, and a
  // band that narrow would bury the coast and the ranges in white every time
  // the dataset narrowed. The world is a fixed size even when the tower is not.
  const fogNear = islandEnabled ? Math.max(fogReference * fog.nearFactor, 1500) : fogReference * fog.nearFactor
  const fogFar = islandEnabled ? Math.max(fogReference * fog.farFactor, 9000) : fogReference * fog.farFactor

  return (
    <Canvas
      shadows={quality.shadows}
      dpr={quality.dpr}
      frameloop="demand"
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ background: INITIAL_BACKGROUND }}
      aria-label={description}
      role="img"
      onPointerMissed={() => useSelectionStore.getState().select(null)}
      onPointerDown={() => {
        // Any click during the intro jumps straight to the finished building.
        const anim = useAnimationStore.getState()
        if (anim.phase === 'running') anim.skip()
      }}
    >
      {/* `args` is a module constant, and `near`/`far` are props. R3F
          reconstructs an attached object whenever `args` changes identity, and a
          fresh Fog would throw away the colour the driver had written into the
          old one mid-sweep. The background has no element at all: the driver
          installs a Color it owns, for the same reason. */}
      <fog
        attach="fog"
        args={FOG_ARGS}
        near={fogNear}
        far={fogFar}
      />
      {/* Mounted here rather than inside the city, because the auto-cycle has
          to keep running with the city switched off — and because the sky
          registers ticks now too. */}
      <AnimationDriver active={worldMoving} />
      <TimeOfDayDriver />
      <SkyDome />
      <Stars />
      <Clouds />
      <EnvironmentLight />
      <Lights
        boundingRadius={boundingRadius}
        totalHeight={fitHeight}
        shadowMapSize={quality.shadowMapSize}
        shadowReach={cityEnabled ? districtShadowReach() : 0}
      />
      <CameraRig
        boundingRadius={boundingRadius}
        totalHeight={fitHeight}
        autoRotate={autoRotate}
        resetSignal={resetSignal}
        islandViewSignal={islandEnabled ? islandViewSignal : 0}
        worldReach={islandEnabled ? islandConfig.world.halfExtent : 0}
        fogNear={fogNear}
        fogFar={fogFar}
        focus={focus}
      />
      {/* The city replaces the bare plaza; without it the building keeps its
          original standalone ground. Lights still receive the BUILDING's
          bounds either way — widening the shadow frustum to cover the city
          would spend the whole shadow map on empty asphalt. */}
      {/* The island is the ground everything else stands on, so it mounts
          before the city and before the fallback plaza. With it on, neither of
          those draws a ground of its own. */}
      {islandEnabled && <IslandEnvironment />}
      {/* Balloons, parachutes and helicopters. Tied to the island rather than
          to the city: they are over the landscape, and with the island off
          there is nothing for them to be over. */}
      {islandEnabled && <Aircraft />}
      {cityEnabled ? (
        <CityEnvironment />
      ) : (
        !islandEnabled && (
          <Ground boundingRadius={boundingRadius} fadeDistance={fogReference * fog.farFactor} />
        )
      )}
      <Building
        floors={floors}
        showMullions={showDetails}
        showCrown={crowned}
        maxVisibleFloors={maxVisibleFloors}
      />
      <ShadowFreeze contentKey={floors} />
      <ContextLossWatcher />
      {showStats && <Stats />}
    </Canvas>
  )
}
