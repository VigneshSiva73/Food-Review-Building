import * as THREE from 'three'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { Waterfall } from '@/terrain/waterfalls'

/**
 * Falling water and its mist, as two merged buffers.
 *
 * The sheet is a vertical quad hung from the lip across the flow, and the pool
 * is a disc at the foot. Both go into one geometry for every fall on the island
 * — forty landmarks for two draw calls.
 *
 * The sheet's UVs run top-to-bottom in world units, which is what lets the
 * material scroll a texture down it later to make the water move (§12) without
 * touching a vertex.
 */

export interface WaterfallMeshes {
  sheet: THREE.BufferGeometry
  pool: THREE.BufferGeometry
  triangles: number
}

export function buildWaterfallMeshes(
  falls: Waterfall[],
  c: IslandConfig = islandConfig,
): WaterfallMeshes {
  const sheetPos: number[] = []
  const sheetUv: number[] = []
  const sheetIdx: number[] = []
  const poolPos: number[] = []
  const poolColor: number[] = []
  const poolIdx: number[] = []

  const foam = new THREE.Color('#cfe4ea')
  const pond = new THREE.Color('#3f7d8c')

  for (const f of falls) {
    // Across the flow: the sheet faces the way the water is going.
    const ax = -f.headingZ
    const az = f.headingX
    const hw = f.width / 2
    const base = sheetPos.length / 3

    const topY = f.y + 1.5
    const footY = f.poolY - 1
    // A fall widens a little as it drops and the water spreads.
    const spread = 1.35

    sheetPos.push(f.x + ax * hw, topY, f.z + az * hw)
    sheetPos.push(f.x - ax * hw, topY, f.z - az * hw)
    sheetPos.push(f.x + ax * hw * spread, footY, f.z + az * hw * spread)
    sheetPos.push(f.x - ax * hw * spread, footY, f.z - az * hw * spread)
    // v in world units so the scroll rate is the same on a tall fall and a
    // short one — otherwise a big fall appears to run in slow motion.
    const v = f.height / 40
    sheetUv.push(0, v, 1, v, 0, 0, 1, 0)
    sheetIdx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)

    // The pool at the foot: a disc, foam at the middle where the water lands.
    const centre = poolPos.length / 3
    const radius = f.width * 1.1
    const px = f.x + f.headingX * radius * 0.5
    const pz = f.z + f.headingZ * radius * 0.5
    poolPos.push(px, footY + 0.6, pz)
    poolColor.push(foam.r, foam.g, foam.b, 0.9)
    const SEGMENTS = 12
    for (let s = 0; s <= SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2
      poolPos.push(px + Math.cos(a) * radius, footY + 0.6, pz + Math.sin(a) * radius)
      poolColor.push(pond.r, pond.g, pond.b, 0.5)
      if (s > 0) poolIdx.push(centre, centre + s, centre + s + 1)
    }
  }

  const sheet = new THREE.BufferGeometry()
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(sheetPos, 3))
  sheet.setAttribute('uv', new THREE.Float32BufferAttribute(sheetUv, 2))
  sheet.setIndex(sheetIdx)
  sheet.computeVertexNormals()
  sheet.computeBoundingSphere()

  const pool = new THREE.BufferGeometry()
  pool.setAttribute('position', new THREE.Float32BufferAttribute(poolPos, 3))
  pool.setAttribute('color', new THREE.Float32BufferAttribute(poolColor, 4))
  pool.setIndex(poolIdx)
  pool.computeVertexNormals()
  pool.computeBoundingSphere()

  void c
  return { sheet, pool, triangles: sheetIdx.length / 3 + poolIdx.length / 3 }
}
