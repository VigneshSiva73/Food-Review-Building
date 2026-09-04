import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { heightField } from '@/terrain/heightField'
import { buildDwellings, buildSettlements } from '@/terrain/settlements'
import { rngFrom } from '@/utils/rng'
import { noopRaycast } from '../instancing'

/**
 * Houses, hamlets and coastal villages outside the city.
 *
 * Two InstancedMeshes for the lot: walls and roofs. Placement, size and form
 * all come from `settlements.ts`, which reads the terrain — so nothing here
 * chooses where anything goes, and no building can end up on a cliff, in a
 * river, below the tide line or inside the city.
 *
 * Everything is deliberately small. §19 is explicit that the outer island must
 * not grow skyscrapers: the tallest thing here is about five storeys against
 * the tower's nine hundred units, which is what keeps the Food Building the
 * landmark it is meant to be.
 */

const WALL_TONES = ['#cfc3ad', '#c2b49c', '#d6cdb8', '#b8a893', '#c9bda6']
const ROOF_TONES = ['#8a5f4a', '#7c5341', '#6f6157', '#946b52', '#5f5348']

export function Settlements() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  const dwellings = useMemo(() => {
    const field = heightField()
    return buildDwellings(field, buildSettlements(field))
  }, [])

  const meshes = useMemo(() => {
    if (dwellings.length === 0) return []
    const rng = rngFrom('island:dwelling-tone')
    const box = new THREE.BoxGeometry(1, 1, 1)
    // Roofs sit on top and overhang slightly, which is most of what makes a box
    // read as a building rather than as a crate.
    const roofGeom = new THREE.BoxGeometry(1, 1, 1)

    const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 })
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 })

    const walls = new THREE.InstancedMesh(box, wallMat, dwellings.length)
    const roofs = new THREE.InstancedMesh(roofGeom, roofMat, dwellings.length)

    const matrix = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    const colour = new THREE.Color()

    dwellings.forEach((d, i) => {
      quat.setFromAxisAngle(up, d.rotation)

      // Sunk very slightly, so a building on a gentle slope has no daylight
      // under its uphill corner.
      pos.set(d.x, d.y + d.height / 2 - 1.5, d.z)
      scale.set(d.width, d.height, d.depth)
      matrix.compose(pos, quat, scale)
      walls.setMatrixAt(i, matrix)
      colour.set(WALL_TONES[Math.floor(rng.next() * WALL_TONES.length)])
      walls.setColorAt(i, colour)

      const roofHeight = Math.max(2.2, d.height * 0.16)
      pos.set(d.x, d.y + d.height - 1.5 + roofHeight / 2, d.z)
      scale.set(d.width * 1.16, roofHeight, d.depth * 1.16)
      matrix.compose(pos, quat, scale)
      roofs.setMatrixAt(i, matrix)
      colour.set(ROOF_TONES[Math.floor(rng.next() * ROOF_TONES.length)])
      roofs.setColorAt(i, colour)
    })

    for (const mesh of [walls, roofs]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      // Never casters: the shadow map is frozen and fitted to the tower.
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = noopRaycast
    }
    walls.name = 'island-dwellings'
    roofs.name = 'island-roofs'
    return [walls, roofs]
  }, [dwellings])

  useEffect(() => {
    for (const mesh of meshes) scene.add(mesh)
    invalidate()
    return () => {
      for (const mesh of meshes) {
        scene.remove(mesh)
        ;(mesh.material as THREE.Material).dispose()
        mesh.geometry.dispose()
        mesh.dispose()
      }
    }
  }, [meshes, scene, invalidate])

  return null
}
