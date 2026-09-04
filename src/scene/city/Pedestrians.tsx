import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  advanceFleet,
  createFleetState,
  pedestrianBodies,
  poseInto,
  PEDESTRIAN_KINETICS,
  type FlatPose,
  type PedestrianNetwork,
  type PedestrianSpec,
  type SignalPhase,
} from '@/city'
import { cityConfig } from '@/config'
import { composeInstance, noopRaycast } from '../instancing'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { cityMaterials, GROUND_LAYERS } from './cityResources'
import { pedestrianGeometry } from './pedestrianGeometry'

/**
 * People on foot (plan §20).
 *
 * One InstancedMesh for the whole crowd, stepped by the same `advanceFleet`
 * that drives the traffic — the two fleets differ only in their kinetics and
 * in which half of the signal cycle they may move through.
 *
 * Walkers bob as they go, by an amount scaled to how fast they are actually
 * moving. It costs nothing, since the matrix is being rewritten anyway, and it
 * makes the phase legible from a distance: the figures held at a kerb are the
 * ones standing perfectly still.
 */

/** Walkers stand on the footway, which sits on the kerb upstand. */
const WALK_Y: number = GROUND_LAYERS.kerbTop

const CLOTHING = [
  '#8d5f52',
  '#4f6478',
  '#7d7f6a',
  '#a9a29a',
  '#5b5560',
  '#6f8a72',
  '#c2b39a',
  '#43506b',
]

export function Pedestrians({
  people,
  network,
  signals,
  animate,
}: {
  people: PedestrianSpec[]
  network: PedestrianNetwork
  signals: SignalPhase[]
  /** When false the crowd stays on screen but stops advancing. */
  animate: boolean
}) {
  const materials = cityMaterials()
  const mesh = useRef<THREE.InstancedMesh>(null)

  const fleet = useMemo(
    () =>
      createFleetState(pedestrianBodies(people), signals.length, {
        kinetics: PEDESTRIAN_KINETICS,
        goOn: 'red',
      }),
    [people, signals.length],
  )

  const colors = useMemo(
    () =>
      people.map(
        (p) => new THREE.Color(CLOTHING[Math.floor(p.variant * CLOTHING.length) % CLOTHING.length]),
      ),
    [people],
  )

  const scratch = useRef({
    pose: { x: 0, z: 0, heading: 0 } as FlatPose,
    transform: {
      position: { x: 0, y: WALK_Y, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotY: 0,
    },
  }).current

  const write = useCallback(() => {
    const target = mesh.current
    if (!target) return
    const { pose, transform } = scratch
    const { bob, bobRate } = cityConfig.pedestrians
    for (let i = 0; i < fleet.count; i++) {
      poseInto(network.routes[fleet.routeOf[i]], fleet.distance[i], pose)
      // Gait amplitude tracks actual pace, so someone waiting is motionless.
      const pace = fleet.cruise[i] > 0 ? fleet.speed[i] / fleet.cruise[i] : 0
      transform.position.x = pose.x
      transform.position.z = pose.z
      transform.position.y =
        WALK_Y + Math.abs(Math.sin(fleet.distance[i] * bobRate)) * bob * pace
      transform.rotY = pose.heading
      target.setMatrixAt(i, composeInstance(transform))
    }
    target.instanceMatrix.needsUpdate = true
  }, [fleet, network, scratch])

  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return
    for (let i = 0; i < colors.length; i++) target.setColorAt(i, colors[i])
    if (target.instanceColor) target.instanceColor.needsUpdate = true
    write()
  }, [colors, write])

  useEffect(() => {
    if (!animate) return
    return registerFrameSystem((dt, elapsedMs) => {
      advanceFleet(fleet, network.routes, network.stops, signals, elapsedMs, dt)
      write()
    })
  }, [animate, fleet, network, signals, write])

  if (people.length === 0) return null

  return (
    <instancedMesh
      ref={mesh}
      name="city-pedestrians"
      args={[pedestrianGeometry(), materials.pedestrian, people.length]}
      raycast={noopRaycast}
      frustumCulled={false}
    />
  )
}
