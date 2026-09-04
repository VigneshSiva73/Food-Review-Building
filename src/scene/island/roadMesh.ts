import * as THREE from 'three'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { Road } from '@/terrain/roads'

/**
 * Road surfaces, as one merged ribbon for the whole island.
 *
 * Each segment is a quad laid across the direction of travel, its width set by
 * how many settlements use it — so trunk roads are visibly wider than the spur
 * that serves one hamlet, without anything classifying them.
 *
 * The surface follows the ground it was routed over and sits a little above it.
 * It is not draped or projected: the route was chosen on the terrain in the
 * first place, so the elevations already agree.
 */

export interface RoadMesh {
  geometry: THREE.BufferGeometry
  triangles: number
}

export interface RibbonStyle {
  /** Fixed width, or undefined to widen with traffic as a road does. */
  fixedWidth?: number
  baseWidth: number
  widthPerUser: number
  maxWidth: number
  surfaceLift: number
  near: THREE.Color
  far: THREE.Color
}

/**
 * A trail is the same ribbon at a fixed narrow width and an earthier tone.
 *
 * Sharing the builder rather than copying it means a path and a lane can never
 * drift apart in how they sit on the ground.
 */
export function buildTrailMesh(trails: Road[], c: IslandConfig = islandConfig): RoadMesh {
  return buildRibbon(trails, {
    fixedWidth: c.trails.width,
    baseWidth: c.trails.width,
    widthPerUser: 0,
    maxWidth: c.trails.width,
    surfaceLift: c.trails.surfaceLift,
    near: new THREE.Color('#8a7c63'),
    far: new THREE.Color('#8a7c63'),
  })
}

export function buildRoadMesh(roads: Road[], c: IslandConfig = islandConfig): RoadMesh {
  const r = c.roads
  return buildRibbon(roads, {
    baseWidth: r.baseWidth,
    widthPerUser: r.widthPerUser,
    maxWidth: r.maxWidth,
    surfaceLift: r.surfaceLift,
    near: new THREE.Color('#6b6152'),
    far: new THREE.Color('#4c4741'),
  })
}

function buildRibbon(roads: Road[], style: RibbonStyle): RoadMesh {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  const tmp = new THREE.Color()

  for (const road of roads) {
    if (road.length < 2) continue
    const base = positions.length / 3
    for (let i = 0; i < road.length; i++) {
      const p = road[i]
      const a = road[Math.max(0, i - 1)]
      const b = road[Math.min(road.length - 1, i + 1)]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz) || 1
      const nx = -dz / len
      const nz = dx / len

      const width =
        style.fixedWidth ??
        Math.min(style.maxWidth, style.baseWidth + style.widthPerUser * (p.traffic - 1))
      const hw = width / 2
      const y = p.y + style.surfaceLift

      positions.push(p.x + nx * hw, y, p.z + nz * hw)
      positions.push(p.x - nx * hw, y, p.z - nz * hw)

      // Busy roads are made up; a spur to one hamlet is a dirt track.
      tmp.lerpColors(style.near, style.far, Math.min(1, (p.traffic - 1) / 5))
      for (let k = 0; k < 2; k++) colors.push(tmp.r, tmp.g, tmp.b)
    }

    for (let i = 0; i < road.length - 1; i++) {
      const o = base + i * 2
      indices.push(o, o + 2, o + 1, o + 1, o + 2, o + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return { geometry, triangles: indices.length / 3 }
}
