import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { cityConfig } from '@/config'
import type { TreePlacement } from '@/city'
import { noopRaycast, writeInstances, type AnyTransform } from '../instancing'
import { cityMaterials } from './cityResources'
import {
  coconutCanopyFarGeometry,
  coconutCanopyGeometry,
  coconutTrunkGeometry,
  treeCanopyFarGeometry,
  treeCanopyGeometry,
  treeTrunkGeometry,
} from './propGeometry'

/** Foliage palette, warm to cool. Sampled by each tree's seeded variant. */
const FOLIAGE = ['#4e6b39', '#5a7740', '#41603a', '#6a7f42', '#3d5c3c', '#748a4a'].map(
  (hex) => new THREE.Color(hex),
)

/** Tropical coconut frond palette. */
const COCONUT_FOLIAGE = ['#2e7d32', '#388e3c', '#43a047', '#4caf50', '#1b5e20', '#558b2f'].map(
  (hex) => new THREE.Color(hex),
)

interface TreeParts {
  trunks: AnyTransform[]
  canopies: AnyTransform[]
  colors: THREE.Color[]
}

function buildParts(
  trees: TreePlacement[],
  canopyOnly = false,
  palette: THREE.Color[] = FOLIAGE,
): TreeParts {
  const { trunkFraction } = cityConfig.props.tree
  const trunks: AnyTransform[] = []
  const canopies: AnyTransform[] = []
  const colors: THREE.Color[] = []

  for (const t of trees) {
    const isCoconut = t.treeKind === 'coconut'
    const frac = isCoconut ? 0.7 : trunkFraction
    const trunkHeight = t.height * frac

    if (!canopyOnly) {
      trunks.push({
        position: { x: t.position.x, y: t.baseY, z: t.position.z },
        scale: { x: isCoconut ? 1.2 : 1, y: trunkHeight, z: isCoconut ? 1.2 : 1 },
        rotY: t.rotationY,
      })
    }

    const canopyHeight = canopyOnly ? t.height : t.height - trunkHeight * 0.75
    canopies.push({
      position: { x: t.position.x, y: t.baseY + t.height - canopyHeight, z: t.position.z },
      scale: { x: t.canopyRadius, y: canopyHeight / 2, z: t.canopyRadius },
      rotY: t.rotationY,
    })

    const shade = palette[Math.floor(t.variant * palette.length) % palette.length]
    colors.push(shade.clone().multiplyScalar(0.88 + t.variant * 0.24))
  }

  return { trunks, canopies, colors }
}

function TreeTier({
  name,
  trees,
  trunkGeometry,
  canopyGeometry,
  palette = FOLIAGE,
}: {
  name: string
  trees: TreePlacement[]
  trunkGeometry?: THREE.BufferGeometry
  canopyGeometry: THREE.BufferGeometry
  palette?: THREE.Color[]
}) {
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopyRef = useRef<THREE.InstancedMesh>(null)
  const materials = cityMaterials()
  const parts = useMemo(() => buildParts(trees, !trunkGeometry, palette), [trees, trunkGeometry, palette])

  useLayoutEffect(() => {
    if (trunkRef.current) writeInstances(trunkRef.current, parts.trunks)
    const canopy = canopyRef.current
    if (!canopy) return
    writeInstances(canopy, parts.canopies)
    for (let i = 0; i < parts.colors.length; i++) canopy.setColorAt(i, parts.colors[i])
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true
  }, [parts])

  if (trees.length === 0) return null

  return (
    <>
      {trunkGeometry && (
        <instancedMesh
          ref={trunkRef}
          name={`city-tree-trunks-${name}`}
          args={[trunkGeometry, materials.bark, trees.length]}
          raycast={noopRaycast}
          receiveShadow
        />
      )}
      <instancedMesh
        ref={canopyRef}
        name={`city-tree-canopies-${name}`}
        args={[canopyGeometry, materials.foliage, trees.length]}
        raycast={noopRaycast}
        castShadow
        receiveShadow
      />
    </>
  )
}

export function Greenery({ trees }: { trees: TreePlacement[] }) {
  const tiers = useMemo(
    () => ({
      standardNear: trees.filter((t) => t.treeKind !== 'coconut' && t.detail === 'near'),
      standardFar: trees.filter((t) => t.treeKind !== 'coconut' && t.detail === 'far'),
      coconutNear: trees.filter((t) => t.treeKind === 'coconut' && t.detail === 'near'),
      coconutFar: trees.filter((t) => t.treeKind === 'coconut' && t.detail === 'far'),
    }),
    [trees],
  )

  if (trees.length === 0) return null

  return (
    <group name="city-greenery">
      <TreeTier
        name="standard-near"
        trees={tiers.standardNear}
        trunkGeometry={treeTrunkGeometry()}
        canopyGeometry={treeCanopyGeometry()}
        palette={FOLIAGE}
      />
      <TreeTier
        name="standard-far"
        trees={tiers.standardFar}
        canopyGeometry={treeCanopyFarGeometry()}
        palette={FOLIAGE}
      />
      <TreeTier
        name="coconut-near"
        trees={tiers.coconutNear}
        trunkGeometry={coconutTrunkGeometry()}
        canopyGeometry={coconutCanopyGeometry()}
        palette={COCONUT_FOLIAGE}
      />
      <TreeTier
        name="coconut-far"
        trees={tiers.coconutFar}
        trunkGeometry={coconutTrunkGeometry()}
        canopyGeometry={coconutCanopyFarGeometry()}
        palette={COCONUT_FOLIAGE}
      />
    </group>
  )
}
