import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { cameraConfig, islandConfig, moduleHeight } from '@/config'
import { prefersReducedMotion } from '@/utils/motion'
import { computeFit } from './cameraFit'
import {
  advanceFlight,
  arcBulge,
  shortestAngleDelta,
  smootherstep,
  targetLift,
  travelDuration,
} from './cameraMotion'

export interface FocusPoint {
  point: [number, number, number]
  /** How far to sit from the point, in scene units. */
  distance: number
  nonce: number
}

interface CameraRigProps {
  /** Horizontal bounding radius of the content. */
  boundingRadius: number
  /** Total content height. */
  totalHeight: number
  autoRotate?: boolean
  /** Increment to fly the camera back to the fit pose (reset button / R). */
  resetSignal?: number
  /** Latest focus request: travel to this point (plan §24). */
  focus?: FocusPoint | null
  /** Bumped to fly out to the framing that shows the whole island. */
  islandViewSignal?: number
  /**
   * How far the world extends beyond the building, if anything does.
   *
   * The far plane and the orbit limit are both fitted to the TOWER, which is
   * right while the tower is all there is. With an island around it they are
   * not: the fit shrinks with the month filter, and at a handful of floors the
   * far plane clamps to 500 — close enough to clip the coastline out of
   * existence. Zero means nothing out there and the old behaviour stands.
   */
  worldReach?: number
  /** Haze the tower's own fit asks for. Used as a floor, never lowered. */
  fogNear?: number
  fogFar?: number
}

const DEG = Math.PI / 180

/**
 * A flight in progress. The path is stored in spherical coordinates *about its
 * own target*, so interpolating it swings the camera around the building
 * instead of dragging it through the middle.
 */
interface Flight {
  t: number
  durationMs: number
  /**
   * False until the first frame has been seen. That frame's delta measures how
   * long the scene sat idle before the flight began, not travel time, so it is
   * discarded rather than integrated.
   */
  primed: boolean
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromSpherical: THREE.Spherical
  toSpherical: THREE.Spherical
  /** Shortest way round in azimuth, so it never takes the long way. */
  thetaDelta: number
}

const tmpTarget = new THREE.Vector3()
const tmpOffset = new THREE.Vector3()
const tmpSpherical = new THREE.Spherical()

/**
 * Camera + controls with one cinematic travel system covering reset, re-fit
 * (new dataset / explode toggle) and selection focus. Any user interaction on
 * the controls cancels a flight immediately (plan §24). Works under
 * frameloop="demand" by self-invalidating while moving.
 */
export function CameraRig({
  boundingRadius,
  totalHeight,
  autoRotate = false,
  resetSignal = 0,
  focus = null,
  islandViewSignal = 0,
  worldReach = 0,
  fogNear = 0,
  fogFar = 0,
}: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const flightRef = useRef<Flight | null>(null)
  const firstFit = useRef(true)
  const invalidate = useThree((s) => s.invalidate)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const reducedMotion = useMemo(() => prefersReducedMotion(), [])
  const c = cameraConfig

  const fit = useMemo(() => computeFit(boundingRadius, totalHeight), [boundingRadius, totalHeight])

  /** Finish or abandon a flight, handing inertia back to OrbitControls. */
  const endFlight = () => {
    const controls = controlsRef.current
    // oxlint-disable-next-line react/immutability -- three.js controls are mutable by design.
    if (controls) controls.enableDamping = true
    flightRef.current = null
  }

  const flyTo = (toPos: THREE.Vector3, toTarget: THREE.Vector3) => {
    const controls = controlsRef.current
    if (!controls) return

    if (reducedMotion) {
      controls.target.copy(toTarget)
      controls.object.position.copy(toPos)
      controls.update()
      endFlight()
      invalidate()
      return
    }

    const fromTarget = controls.target.clone()
    const fromSpherical = new THREE.Spherical().setFromVector3(
      controls.object.position.clone().sub(fromTarget),
    )
    const toSpherical = new THREE.Spherical().setFromVector3(toPos.clone().sub(toTarget))

    // Suspend damping for the duration: we drive position and target directly
    // each frame, and residual inertia from the user's last drag would fight
    // the flight. Controls stay enabled, so a drag still cancels it.
    // oxlint-disable-next-line react/immutability -- three.js controls are mutable by design.
    controls.enableDamping = false

    flightRef.current = {
      t: 0,
      primed: false,
      durationMs: travelDuration(controls.object.position.distanceTo(toPos)),
      fromTarget,
      toTarget: toTarget.clone(),
      fromSpherical,
      toSpherical,
      thetaDelta: shortestAngleDelta(fromSpherical.theta, toSpherical.theta),
    }
    invalidate()
  }

  const flyToFit = () =>
    flyTo(new THREE.Vector3(...fit.position), new THREE.Vector3(...fit.target))

  // Initial mount snaps; later bound changes (new dataset, explode) fly.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (firstFit.current) {
      firstFit.current = false
      controls.target.set(...fit.target)
      controls.object.position.set(...fit.position)
      controls.update()
      return
    }
    flyToFit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit])

  // Reset request → fly back to the fit pose.
  useEffect(() => {
    if (resetSignal > 0) flyToFit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])

  /**
   * Out to the island, and back the way the reset button comes back.
   *
   * Flown rather than cut: the pose is ten thousand units from the opening one,
   * and a jump that far reads as a different scene having loaded rather than as
   * the same one seen from further off.
   */
  useEffect(() => {
    if (islandViewSignal <= 0) return
    const v = islandConfig.view
    flyTo(new THREE.Vector3(...v.position), new THREE.Vector3(...v.target))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [islandViewSignal])

  /**
   * Haze that opens up as the viewer pulls back.
   *
   * The fog was keyed to the tower's height so the band stayed in proportion to
   * whatever was on screen. That principle is right; it just ran out of road
   * once there was a world around the tower. An island eighteen thousand units
   * across has to be looked at from far enough away that haze fitted to a
   * fourteen-hundred-unit view turns all of it into flat pale blue.
   *
   * So the same proportionality is extended from the tower's height to the
   * viewing distance, and taken as a FLOOR: at the opening camera the
   * tower-derived figures win outright and the default view is untouched, and
   * only pulling back past them opens the haze. §34's atmospheric perspective
   * comes out of this rather than being a separate effect.
   */
  useFrame(() => {
    if (!worldReach || !scene.fog) return
    const fog = scene.fog as THREE.Fog
    const target = controlsRef.current?.target
    const distance = target
      ? camera.position.distanceTo(target)
      : camera.position.distanceTo(tmpTarget.set(...fit.target))
    const near = Math.max(fogNear, distance * 0.55)
    const far = Math.max(fogFar, distance * 3.1)
    if (fog.near !== near || fog.far !== far) {
      // oxlint-disable-next-line react/immutability -- three.js fog is mutable by design.
      fog.near = near
      // oxlint-disable-next-line react/immutability
      fog.far = far
    }

    // The camera's NEAR plane has to move with the distance too, and this is
    // load-bearing rather than a refinement. A world this size pushes the far
    // plane past twenty-five thousand, and against a near plane of 0.1 that is
    // a ratio of a quarter of a million to one — at which a 24-bit depth buffer
    // resolves nothing at all out at the island. The first render of the
    // terrain was invisible for exactly this reason: 115,000 triangles of land
    // sitting hundreds of units above the sea, losing the depth test to it.
    // Scaling near with distance keeps the ratio near a thousand to one, and
    // costs nothing up close because up close the distance is small.
    const wantNear = Math.min(60, Math.max(cameraConfig.near, distance * 0.0025))
    if (Math.abs(camera.near - wantNear) > wantNear * 0.05) {
      // oxlint-disable-next-line react/immutability -- three.js cameras are mutable by design.
      camera.near = wantNear
      camera.updateProjectionMatrix()
    }
  })

  // Focus request → approach the target, staying outside the building.
  useEffect(() => {
    const controls = controlsRef.current
    if (!focus || !controls) return
    const target = new THREE.Vector3(...focus.point)
    const distance = Math.max(focus.distance, c.controls.minDistanceUnits)

    // Keep the viewer's current angle where possible, but never end up inside
    // the tower: if the existing direction would put the camera on the inner
    // side of the target, approach radially from outside instead.
    const outward = new THREE.Vector3(target.x, 0, target.z)
    if (outward.lengthSq() < 1e-6) outward.set(0, 0, 1)
    outward.normalize()

    const dir = controls.object.position.clone().sub(target)
    const horizontal = new THREE.Vector3(dir.x, 0, dir.z)
    if (horizontal.lengthSq() < 1e-6 || horizontal.normalize().dot(outward) < 0.15) {
      dir.set(outward.x, 0.35, outward.z)
    }
    dir.normalize().multiplyScalar(distance)
    flyTo(target.clone().add(dir), target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce])

  // User interaction cancels any flight in progress.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const cancel = () => {
      if (flightRef.current) endFlight()
    }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [])

  useFrame((_, delta) => {
    const flight = flightRef.current
    const controls = controlsRef.current
    if (!flight || !controls) return

    if (flight.primed) {
      flight.t = advanceFlight(flight.t, delta, flight.durationMs)
    } else {
      flight.primed = true
    }
    const e = smootherstep(flight.t)

    tmpTarget.lerpVectors(flight.fromTarget, flight.toTarget, e)
    // A gentle crane on the look-at point; zero at both ends.
    tmpTarget.y += moduleHeight() * targetLift(flight.t)
    // The bulge is zero at both ends, so the endpoints stay exact.
    tmpSpherical.set(
      THREE.MathUtils.lerp(flight.fromSpherical.radius, flight.toSpherical.radius, e) *
        arcBulge(flight.t),
      THREE.MathUtils.lerp(flight.fromSpherical.phi, flight.toSpherical.phi, e),
      flight.fromSpherical.theta + flight.thetaDelta * e,
    )
    tmpSpherical.makeSafe()
    tmpOffset.setFromSpherical(tmpSpherical)

    controls.target.copy(tmpTarget)
    controls.object.position.copy(tmpTarget).add(tmpOffset)
    controls.update()

    if (flight.t >= 1) endFlight()
    else invalidate()
  })

  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={c.fov}
        near={c.near}
        far={Math.max(c.farMin, fit.distance * 10, worldReach * 3)}
        position={fit.position}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={c.controls.dampingFactor}
        minPolarAngle={c.controls.minPolarAngleDeg * DEG}
        maxPolarAngle={c.controls.maxPolarAngleDeg * DEG}
        minDistance={c.controls.minDistanceUnits}
        maxDistance={Math.max(fit.distance * c.controls.maxDistanceFactor, worldReach * 1.9)}
        autoRotate={autoRotate}
        autoRotateSpeed={c.controls.autoRotateSpeed}
        target={fit.target}
        // Touch: one finger orbits, two fingers pinch-zoom and pan (plan §31).
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
    </>
  )
}
