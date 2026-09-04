import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  advanceFleet,
  createFleetState,
  poseInto,
  TRAFFIC_KINETICS,
  vehicleBodies,
  type FlatPose,
  type Route,
  type RouteStop,
  type SignalPhase,
  type VehicleKind,
  type VehicleSpec,
} from '@/city'
import { composeInstance, noopRaycast } from '../instancing'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { cityMaterials, GROUND_LAYERS } from './cityResources'
import { vehicleGeometry } from './vehicleGeometry'

/**
 * Moving traffic (plan §18).
 *
 * One InstancedMesh per vehicle kind. All the behaviour — following, queueing,
 * stopping at red — lives in the pure layer's `advanceFleet`, so it can be
 * simulated and asserted in tests; what a still screenshot cannot show is
 * exactly what needed to be testable. This component does one job: turn the
 * fleet's arc-length positions into instance matrices.
 *
 * Vehicles never cast shadows. The sun's shadow map is rendered once and then
 * frozen, so a moving caster would drag a stale shadow around behind it — the
 * one artefact that would look worse than no shadow at all.
 */

/** Ride height: clear of the asphalt and its lane paint. */
const VEHICLE_Y = GROUND_LAYERS.markings + 0.006

const KINDS: VehicleKind[] = ['car', 'van', 'bus']

/** Body colours. Cars draw from the whole range; vans and buses stay plain. */
const CAR_PAINT = ['#b8bcc4', '#8d949e', '#5e6874', '#9c5f52', '#4a6572', '#c9b98f', '#37414d']
const UTILITY_PAINT = ['#d8d5cd', '#8f9aa4', '#6d7783']

/** Which mesh and slot each vehicle draws into. */
interface Slots {
  kindOf: Uint8Array
  slot: Int32Array
  perKind: { kind: VehicleKind; count: number; colors: THREE.Color[] }[]
}

function assignSlots(specs: VehicleSpec[]): Slots {
  const slots: Slots = {
    kindOf: new Uint8Array(specs.length),
    slot: new Int32Array(specs.length),
    perKind: KINDS.map((kind) => ({ kind, count: 0, colors: [] })),
  }
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const k = KINDS.indexOf(spec.kind)
    slots.kindOf[i] = k
    const group = slots.perKind[k]
    slots.slot[i] = group.count++
    const palette = spec.kind === 'car' ? CAR_PAINT : UTILITY_PAINT
    group.colors.push(
      new THREE.Color(palette[Math.floor(spec.variant * palette.length) % palette.length]),
    )
  }
  return slots
}

export function Traffic({
  vehicles,
  routes,
  stops,
  signals,
  animate,
}: {
  vehicles: VehicleSpec[]
  routes: Route[]
  stops: RouteStop[][]
  signals: SignalPhase[]
  /** When false the fleet stays on screen but stops advancing. */
  animate: boolean
}) {
  const materials = cityMaterials()
  const fleet = useMemo(
    () =>
      createFleetState(vehicleBodies(vehicles), signals.length, { kinetics: TRAFFIC_KINETICS }),
    [vehicles, signals.length],
  )
  const slots = useMemo(() => assignSlots(vehicles), [vehicles])
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([null, null, null])

  // Scratch lives in a ref, the sanctioned mutable container: the point of the
  // fleet's typed arrays is that the per-frame path allocates nothing at all.
  const scratch = useRef({
    pose: { x: 0, z: 0, heading: 0 } as FlatPose,
    transform: {
      position: { x: 0, y: VEHICLE_Y, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotY: 0,
    },
  }).current

  const write = useCallback(() => {
    const { pose, transform } = scratch
    for (let i = 0; i < fleet.count; i++) {
      const mesh = meshes.current[slots.kindOf[i]]
      if (!mesh) continue
      poseInto(routes[fleet.routeOf[i]], fleet.distance[i], pose)
      transform.position.x = pose.x
      transform.position.z = pose.z
      transform.rotY = pose.heading
      const matrix = composeInstance(transform)
      mesh.setMatrixAt(slots.slot[i], matrix)
    }
    for (let k = 0; k < KINDS.length; k++) {
      const mesh = meshes.current[k]
      if (mesh) mesh.instanceMatrix.needsUpdate = true
    }
  }, [fleet, slots, routes, scratch])

  // Paint and starting positions, written before the first paint so a paused
  // city still shows a full complement of stationary traffic rather than a
  // heap of vehicles stacked at the origin.
  useLayoutEffect(() => {
    for (let k = 0; k < KINDS.length; k++) {
      const mesh = meshes.current[k]
      if (!mesh) continue
      const { colors } = slots.perKind[k]
      for (let s = 0; s < colors.length; s++) mesh.setColorAt(s, colors[s])
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    write()
  }, [slots, write])

  // Registration is what the toggle controls, not the frame loop: the driver
  // ticks every registered system, so switching traffic off has to remove this
  // one or the cars would keep moving whenever pedestrians were still on.
  useEffect(() => {
    if (!animate) return
    return registerFrameSystem((dt, elapsedMs) => {
      advanceFleet(fleet, routes, stops, signals, elapsedMs, dt)
      write()
    })
  }, [animate, fleet, routes, stops, signals, write])

  if (vehicles.length === 0) return null

  return (
    <group name="city-traffic">
      {KINDS.map((kind, k) =>
        slots.perKind[k].count === 0 ? null : (
          <instancedMesh
            key={kind}
            ref={(m) => {
              meshes.current[k] = m
            }}
            name={`city-vehicle-${kind}`}
            args={[vehicleGeometry(kind), materials.vehicle, slots.perKind[k].count]}
            raycast={noopRaycast}
            frustumCulled={false}
          />
        ),
      )}
    </group>
  )
}
