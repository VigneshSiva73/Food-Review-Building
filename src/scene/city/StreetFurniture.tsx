import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PropKind, PropPlacement } from '@/city'
import { noopRaycast, writeInstances, type AnyTransform } from '../instancing'
import { cityMaterials, type CityMaterials } from './cityResources'
import { lampLensGeometry, lampLensY } from './signalGeometry'
import {
  benchGeometry,
  binGeometry,
  bollardGeometry,
  busStopGeometry,
  lampGeometry,
  LAMP_ARM_REACH,
} from './propGeometry'

/**
 * Lamps, benches, bins, bollards and bus shelters (plan §16).
 *
 * One InstancedMesh per kind — five draw calls for every piece of furniture in
 * the district. Each kind's geometry is already merged, so a lamp's post, arm
 * and head arrive together in a single instance.
 *
 * Nothing here casts a shadow. The sun's shadow map is fitted to the tower and
 * frozen; a bollard is about one texel across in it, so casting would buy a
 * smear of noise rather than a shadow.
 */

type GeometryFor = Record<PropKind, () => THREE.BufferGeometry>

const GEOMETRY_OF: GeometryFor = {
  lamp: lampGeometry,
  bench: benchGeometry,
  bin: binGeometry,
  bollard: bollardGeometry,
  busStop: busStopGeometry,
}

const MATERIAL_OF: Record<PropKind, keyof CityMaterials> = {
  lamp: 'streetMetal',
  bench: 'timber',
  bin: 'streetMetal',
  bollard: 'streetMetal',
  busStop: 'streetMetal',
}

const KINDS = Object.keys(GEOMETRY_OF) as PropKind[]

function Kind({ kind, items }: { kind: PropKind; items: PropPlacement[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const materials = cityMaterials()

  const transforms = useMemo<AnyTransform[]>(
    () =>
      items.map((p) => ({
        position: { x: p.position.x, y: p.baseY, z: p.position.z },
        scale: { x: 1, y: 1, z: 1 },
        rotY: p.rotationY,
      })),
    [items],
  )

  useLayoutEffect(() => {
    if (ref.current) writeInstances(ref.current, transforms)
  }, [transforms])

  if (items.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      name={`city-prop-${kind}`}
      args={[GEOMETRY_OF[kind](), materials[MATERIAL_OF[kind]], items.length]}
      raycast={noopRaycast}
      receiveShadow
    />
  )
}

/**
 * The warm diffuser under each street lamp's head.
 *
 * A separate mesh from the lamp itself because it needs the unlit material: a
 * lens that takes shading from the sun reads as a plastic box, not a light.
 * The lamp geometry puts its head on the +Z arm, so each lens is that same
 * local offset turned by the lamp's own yaw.
 */
function LampLenses({ lamps }: { lamps: PropPlacement[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const materials = cityMaterials()

  const transforms = useMemo<AnyTransform[]>(() => {
    const reach = LAMP_ARM_REACH
    const y = lampLensY()
    return lamps.map((lamp) => {
      const sin = Math.sin(lamp.rotationY)
      const cos = Math.cos(lamp.rotationY)
      return {
        position: {
          x: lamp.position.x + sin * reach,
          y: lamp.baseY + y,
          z: lamp.position.z + cos * reach,
        },
        scale: { x: 1, y: 1, z: 1 },
        rotY: lamp.rotationY,
      }
    })
  }, [lamps])

  useLayoutEffect(() => {
    if (ref.current) writeInstances(ref.current, transforms)
  }, [transforms])

  if (lamps.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      name="city-lamp-lenses"
      args={[lampLensGeometry(), materials.lampLens, lamps.length]}
      raycast={noopRaycast}
    />
  )
}

export function StreetFurniture({ props: placements }: { props: PropPlacement[] }) {
  const byKind = useMemo(() => {
    const map = new Map<PropKind, PropPlacement[]>()
    for (const p of placements) {
      const list = map.get(p.kind)
      if (list) list.push(p)
      else map.set(p.kind, [p])
    }
    return map
  }, [placements])

  return (
    <group name="city-furniture">
      {KINDS.map((kind) => (
        <Kind key={kind} kind={kind} items={byKind.get(kind) ?? []} />
      ))}
      <LampLenses lamps={byKind.get('lamp') ?? []} />
    </group>
  )
}
