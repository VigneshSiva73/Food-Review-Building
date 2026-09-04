import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { heightField } from '@/terrain/heightField'
import { buildRocks } from '@/terrain/rocks'
import { rngFrom } from '@/utils/rng'
import { noopRaycast } from '../instancing'

/**
 * Boulders, as one InstancedMesh.
 *
 * A low icosahedron squashed and turned per instance: at the sizes these are
 * seen, faceting IS the rock, and a smoother sphere would read as a pebble.
 * Placement comes entirely from `rocks.ts`, which reads the terrain.
 */

const TONES = ['#7c766c', '#6b665e', '#8a8377', '#5f5a53', '#948c80']

export function Rocks() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  const rocks = useMemo(() => buildRocks(heightField()), [])

  const mesh = useMemo(() => {
    if (rocks.length === 0) return null
    const rng = rngFrom('island:rock-tone')
    // Detail 0: twenty faces. Anything more is invisible at this size and
    // multiplies straight through the instance count.
    const geometry = new THREE.IcosahedronGeometry(1, 0)
    const material = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 })
    const instanced = new THREE.InstancedMesh(geometry, material, rocks.length)

    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const colour = new THREE.Color()

    rocks.forEach((rock, i) => {
      quat.setFromAxisAngle(up, rock.rotation)
      // Sunk to its waist, so a boulder is bedded in the ground rather than
      // resting on it like a dropped prop.
      pos.set(rock.x, rock.y + rock.radius * rock.flatten * 0.35, rock.z)
      scale.set(rock.radius, rock.radius * rock.flatten, rock.radius * 0.88)
      matrix.compose(pos, quat, scale)
      instanced.setMatrixAt(i, matrix)
      colour.set(TONES[Math.floor(rng.next() * TONES.length)])
      instanced.setColorAt(i, colour)
    })

    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.name = 'island-rocks'
    instanced.castShadow = false
    instanced.receiveShadow = false
    instanced.raycast = noopRaycast
    return instanced
  }, [rocks])

  useEffect(() => {
    if (!mesh) return
    scene.add(mesh)
    invalidate()
    return () => {
      scene.remove(mesh)
      ;(mesh.material as THREE.Material).dispose()
      mesh.geometry.dispose()
      mesh.dispose()
    }
  }, [mesh, scene, invalidate])

  return null
}
