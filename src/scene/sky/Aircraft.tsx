import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { islandConfig } from '@/config'
import { aircraftMaterials, disposeAircraftMaterials } from './aircraftResources'
import {
  balloonPose,
  buildAirTraffic,
  helicopterPose,
  parachutePose,
} from '@/air/aircraft'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { noopRaycast } from '../instancing'
import {
  balloonBasketGeometry,
  balloonBurnerGeometry,
  balloonEnvelopeGeometry,
  disposeAircraftGeometry,
  helicopterBodyGeometry,
  helicopterRotorGeometry,
  parachuteGeometry,
} from './aircraftGeometry'

/**
 * Balloons, parachutes and helicopters over the island.
 *
 * Five instanced meshes for the whole sky. Poses are recomputed each frame
 * from the clock rather than integrated — see `air/aircraft.ts` for why — so
 * this owns no state at all beyond the matrices it writes, and a frozen world
 * shows a sky mid-flight rather than one that has stopped.
 *
 * They cast no shadows. The sun's shadow map is rendered once and frozen
 * around the tower, and a balloon's shadow would be baked onto whatever it
 * happened to be over at load and stay there all day.
 */

const ENVELOPE_COLOURS = [
  '#d64545', '#e08b2e', '#f0c419', '#4f9d63', '#3f7fc2',
  '#8d5bb5', '#d8d3c8', '#c2503f', '#2f8f8f',
].map((hex) => new THREE.Color(hex))

const CANOPY_COLOURS = [
  '#e2e6ea', '#d64545', '#f0c419', '#3f7fc2', '#4f9d63',
].map((hex) => new THREE.Color(hex))

const SCRATCH = new THREE.Object3D()

export function Aircraft() {
  const fleet = useMemo(() => buildAirTraffic(), [])
  const invalidate = useThree((s) => s.invalidate)

  const envelopes = useRef<THREE.InstancedMesh>(null)
  const baskets = useRef<THREE.InstancedMesh>(null)
  const chutes = useRef<THREE.InstancedMesh>(null)
  const bodies = useRef<THREE.InstancedMesh>(null)
  const rotors = useRef<THREE.InstancedMesh>(null)
  const burners = useRef<THREE.InstancedMesh>(null)

  const materials = aircraftMaterials()

  // Colours never change, so they are written once rather than per frame.
  useEffect(() => {
    const envelope = envelopes.current
    if (envelope) {
      fleet.balloons.forEach((b, i) => {
        envelope.setColorAt(i, ENVELOPE_COLOURS[Math.floor(b.hue * ENVELOPE_COLOURS.length) % ENVELOPE_COLOURS.length])
      })
      if (envelope.instanceColor) envelope.instanceColor.needsUpdate = true
    }
    const chute = chutes.current
    if (chute) {
      fleet.parachutes.forEach((p, i) => {
        chute.setColorAt(i, CANOPY_COLOURS[Math.floor(p.hue * CANOPY_COLOURS.length) % CANOPY_COLOURS.length])
      })
      if (chute.instanceColor) chute.instanceColor.needsUpdate = true
    }
  }, [fleet])

  useEffect(() => {
    const write = (t: number) => {
      const envelope = envelopes.current
      const basket = baskets.current
      const chute = chutes.current
      const body = bodies.current
      const rotor = rotors.current
      const burner = burners.current

      fleet.balloons.forEach((b, i) => {
        const p = balloonPose(b, t)
        SCRATCH.position.set(p.x, p.y, p.z)
        SCRATCH.rotation.set(0, b.bobPhase + t * b.spin, 0)
        SCRATCH.scale.setScalar(b.radius)
        SCRATCH.updateMatrix()
        envelope?.setMatrixAt(i, SCRATCH.matrix)
        basket?.setMatrixAt(i, SCRATCH.matrix)

        // Burners fire in bursts, not continuously — which is what a balloon
        // actually does, and what makes a night sky full of them flicker
        // rather than sit there like lamps. Seeded per balloon so no two are
        // in step, and scaled to nothing between bursts rather than hidden,
        // since an instanced mesh has no per-instance visibility.
        const burn = Math.sin(t * 0.55 + b.bobPhase * 7.3)
        const firing = burn > 0.45 ? (burn - 0.45) / 0.55 : 0
        SCRATCH.scale.setScalar(b.radius * firing)
        SCRATCH.updateMatrix()
        burner?.setMatrixAt(i, SCRATCH.matrix)
      })

      fleet.parachutes.forEach((c, i) => {
        const { position, progress } = parachutePose(c, t)
        SCRATCH.position.set(position.x, position.y, position.z)
        // A canopy swings under its load; the sway eases off as it settles.
        const sway = Math.sin(t * 0.6 + c.phase * 9) * 0.14 * (1 - progress)
        SCRATCH.rotation.set(sway, c.phase * 6.28, sway * 0.6)
        SCRATCH.scale.setScalar(c.radius)
        SCRATCH.updateMatrix()
        chute?.setMatrixAt(i, SCRATCH.matrix)
      })

      fleet.helicopters.forEach((h, i) => {
        const { position, heading } = helicopterPose(h, t)
        SCRATCH.position.set(position.x, position.y, position.z)
        SCRATCH.rotation.set(0, heading, 0)
        SCRATCH.scale.setScalar(h.scale * 9)
        SCRATCH.updateMatrix()
        body?.setMatrixAt(i, SCRATCH.matrix)
        // The rotor rides the same transform with its own spin on top.
        SCRATCH.rotation.set(0, heading + t * islandConfig.air.helicopters.rotorSpeed, 0)
        SCRATCH.updateMatrix()
        rotor?.setMatrixAt(i, SCRATCH.matrix)
      })

      for (const mesh of [envelope, basket, chute, body, rotor, burner]) {
        if (!mesh) continue
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      }
    }

    // Once at mount, so the sky is populated before anything animates — with
    // the world frozen this is the only call that ever happens.
    write(0)
    invalidate()
    return registerFrameSystem((_, elapsedMs) => write(elapsedMs / 1000))
  }, [fleet, invalidate])

  useEffect(
    () => () => {
      disposeAircraftMaterials()
      disposeAircraftGeometry()
    },
    [],
  )

  return (
    <group name="aircraft">
      <instancedMesh
        ref={envelopes}
        name="balloon-envelopes"
        args={[balloonEnvelopeGeometry(), materials.envelope, fleet.balloons.length]}
        raycast={noopRaycast}
      />
      <instancedMesh
        ref={baskets}
        name="balloon-baskets"
        args={[balloonBasketGeometry(), materials.basket, fleet.balloons.length]}
        raycast={noopRaycast}
      />
      {/* Drawn after the envelopes so the additive flame lands over them. */}
      <instancedMesh
        ref={burners}
        name="balloon-burners"
        args={[balloonBurnerGeometry(), materials.burner, fleet.balloons.length]}
        raycast={noopRaycast}
      />
      <instancedMesh
        ref={chutes}
        name="parachutes"
        args={[parachuteGeometry(), materials.canopy, fleet.parachutes.length]}
        raycast={noopRaycast}
      />
      <instancedMesh
        ref={bodies}
        name="helicopter-bodies"
        args={[helicopterBodyGeometry(), materials.body, fleet.helicopters.length]}
        raycast={noopRaycast}
      />
      <instancedMesh
        ref={rotors}
        name="helicopter-rotors"
        args={[helicopterRotorGeometry(), materials.rotor, fleet.helicopters.length]}
        raycast={noopRaycast}
      />
    </group>
  )
}
