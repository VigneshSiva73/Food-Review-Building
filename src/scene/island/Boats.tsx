import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { islandConfig } from '@/config'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { heightField } from '@/terrain/heightField'
import { rngFrom } from '@/utils/rng'
import { noopRaycast } from '../instancing'

/**
 * A few boats on the water.
 *
 * §37 and §38: some moving slowly, some at anchor, thicker near the beaches and
 * emptying out offshore — which is what gives the sea a sense of scale. Sited
 * off the real seabed, so no boat is ever sitting on dry land or in water it
 * would run aground in.
 *
 * One InstancedMesh. The movers have their matrices rewritten on the shared
 * frame loop; at this count that is a handful of matrix composes per frame,
 * against opening a loop of their own for it.
 */

interface Boat {
  x: number
  z: number
  heading: number
  length: number
  /** Units per second. Zero for a boat at anchor. */
  speed: number
  bobPhase: number
}

const HULL = '#d9d3c6'

function buildBoats(): Boat[] {
  const field = heightField()
  const rng = rngFrom(`${islandConfig.seed}:boats`)
  const sea = islandConfig.world.seaLevel
  const out: Boat[] = []
  let guard = 0

  while (out.length < islandConfig.boats.count && guard++ < 20_000) {
    const x = rng.range(-field.half, field.half)
    const z = rng.range(-field.half, field.half)
    const i = Math.min(field.size - 1, Math.max(0, Math.round((x + field.half) / field.step)))
    const j = Math.min(field.size - 1, Math.max(0, Math.round((z + field.half) / field.step)))
    const depth = sea - field.height[j * field.size + i]
    // Afloat, and not aground: a hull needs water under it.
    if (depth < islandConfig.boats.minDepth) continue

    // Thick near the shore, thinning out to sea. Accepting on a probability
    // that falls with depth is what produces §38's gradient without placing
    // anything in bands.
    const inshore = 1 - Math.min(1, depth / islandConfig.boats.busyDepth)
    if (rng.next() > 0.12 + 0.88 * inshore) continue

    const anchored = rng.chance(islandConfig.boats.anchoredShare)
    out.push({
      x,
      z,
      heading: rng.next() * Math.PI * 2,
      length: rng.range(islandConfig.boats.minLength, islandConfig.boats.maxLength),
      speed: anchored ? 0 : rng.range(4, 11),
      bobPhase: rng.next() * Math.PI * 2,
    })
  }
  return out
}

export function Boats() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  const boats = useMemo(() => buildBoats(), [])

  const mesh = useMemo(() => {
    if (boats.length === 0) return null
    // A hull, roughly: a box narrowed at one end by the scale below. At the
    // distance an island is viewed from this is a boat, and anything more
    // detailed is triangles nobody sees.
    const geometry = new THREE.BoxGeometry(1, 0.45, 0.34)
    const material = new THREE.MeshStandardMaterial({
      color: HULL,
      roughness: 0.72,
      metalness: 0.04,
    })
    const instanced = new THREE.InstancedMesh(geometry, material, boats.length)
    instanced.name = 'island-boats'
    instanced.castShadow = false
    instanced.receiveShadow = false
    instanced.raycast = noopRaycast
    // Their matrices are rewritten as they move.
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return instanced
  }, [boats])

  useEffect(() => {
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const sea = islandConfig.world.seaLevel
    const half = heightField().half

    const write = (seconds: number) => {
      boats.forEach((b, i) => {
        // Wrapped, so a boat that sails off one side of the world returns on
        // the other rather than accumulating forever.
        const travelled = b.speed * seconds
        const x = ((((b.x + Math.cos(b.heading) * travelled + half) % (half * 2)) + half * 2) %
          (half * 2)) - half
        const z = ((((b.z + Math.sin(b.heading) * travelled + half) % (half * 2)) + half * 2) %
          (half * 2)) - half
        pos.set(x, sea + 1.2 + Math.sin(seconds * 0.9 + b.bobPhase) * 0.7, z)
        quat.setFromAxisAngle(up, -b.heading)
        scale.set(b.length, b.length * 0.42, b.length * 0.34)
        matrix.compose(pos, quat, scale)
        // oxlint-disable-next-line react/immutability -- an InstancedMesh is animated by writing its matrices; three.js objects are mutable by design.
        mesh.setMatrixAt(i, matrix)
      })
      // oxlint-disable-next-line react/immutability -- three.js buffer attributes are mutable by design; this is how an InstancedMesh is animated.
      mesh.instanceMatrix.needsUpdate = true
    }

    write(0)
    scene.add(mesh)
    invalidate()

    const release = registerFrameSystem((_, elapsedMs) => write(elapsedMs / 1000))

    return () => {
      release()
      scene.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
      mesh.geometry.dispose()
      mesh.dispose()
    }
  }, [mesh, boats, scene, invalidate])

  return null
}
