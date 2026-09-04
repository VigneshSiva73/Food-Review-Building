import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { islandConfig } from '@/config'
import { heightField } from '@/terrain/heightField'
import { buildTrees, type Species } from '@/terrain/vegetation'
import { getQualityTier } from '@/utils/quality'
import { noopRaycast } from '../instancing'
import { canopyTexture, crossedQuadGeometry, disposeCanopyTextures } from './treeAssets'

/**
 * The island's forests: one InstancedMesh per species.
 *
 * Three draw calls for twenty thousand trees. Placement, species and size all
 * come from `vegetation.ts`, which reads the terrain — so nothing here decides
 * where a tree goes, and a tree can never end up on a cliff, above the tree
 * line, in the sea or in the city.
 */

const SPECIES: readonly Species[] = ['palm', 'broadleaf', 'conifer']

/** World height of a tree at scale 1, per species. */
const HEIGHT: Record<Species, number> = { palm: 46, broadleaf: 38, conifer: 52 }
/** Width relative to height. */
const ASPECT: Record<Species, number> = { palm: 1.15, broadleaf: 1.05, conifer: 0.78 }

export function Vegetation() {
  const invalidate = useThree((s) => s.invalidate)

  const field = useMemo(() => heightField(), [])
  const count = useMemo(
    () =>
      getQualityTier().cityDensity === 'low'
        ? islandConfig.vegetation.countLow
        : islandConfig.vegetation.count,
    [],
  )
  const trees = useMemo(() => buildTrees(field, count), [field, count])

  const geometry = useMemo(() => crossedQuadGeometry(), [])

  const groups = useMemo(() => {
    const out = new Map<Species, THREE.InstancedMesh>()
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()

    for (const species of SPECIES) {
      const members = trees.filter((t) => t.species === species)
      if (members.length === 0) continue
      const material = new THREE.MeshStandardMaterial({
        map: canopyTexture(species),
        // Alpha TEST rather than blending: foliage this dense would need
        // sorting to blend correctly, and cut-out leaves neither sort nor cost
        // anything. It also keeps the trees writing depth, so the ones behind
        // are properly hidden.
        alphaTest: 0.42,
        transparent: false,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0,
      })
      const mesh = new THREE.InstancedMesh(geometry, material, members.length)
      members.forEach((t, i) => {
        position.set(t.x, t.y, t.z)
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rotation)
        const h = HEIGHT[species] * t.scale
        scale.set(h * ASPECT[species], h, h * ASPECT[species])
        matrix.compose(position, quaternion, scale)
        mesh.setMatrixAt(i, matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.name = `island-trees-${species}`
      // Never a caster: the shadow map is frozen and fitted to the tower.
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.raycast = noopRaycast
      out.set(species, mesh)
    }
    return out
  }, [trees, geometry])

  const scene = useThree((s) => s.scene)

  useEffect(() => {
    for (const mesh of groups.values()) scene.add(mesh)
    invalidate()
    return () => {
      for (const mesh of groups.values()) {
        scene.remove(mesh)
        ;(mesh.material as THREE.Material).dispose()
        mesh.dispose()
      }
    }
  }, [groups, scene, invalidate])

  useEffect(
    () => () => {
      geometry.dispose()
      disposeCanopyTextures()
    },
    [geometry],
  )

  return null
}
