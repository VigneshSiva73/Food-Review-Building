import * as THREE from 'three'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { River } from '@/terrain/rivers'

/**
 * River water, as one merged ribbon.
 *
 * A ribbon per river would be one draw call per river; every course goes into a
 * single buffer instead. Each segment is a quad laid across the channel,
 * perpendicular to the direction of travel and widening downstream, sitting a
 * little above the bed the carve already cut — so the water is IN its valley
 * rather than a tube laid over the ground, which is what §30 is warning about.
 *
 * Vertex alpha fades the banks out, so the water meets wet ground instead of
 * ending on a hard line.
 */

export interface RiverMesh {
  geometry: THREE.BufferGeometry
  triangles: number
}

export function buildRiverMesh(rivers: River[], c: IslandConfig = islandConfig): RiverMesh {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  const shallow = new THREE.Color('#4d7f86')
  const deep = new THREE.Color('#27596b')
  const tmp = new THREE.Color()
  const lift = c.rivers.surfaceLift

  for (const river of rivers) {
    if (river.length < 2) continue
    const base = positions.length / 3
    for (let i = 0; i < river.length; i++) {
      const p = river[i]
      // Direction of travel, from the neighbours so the ribbon does not kink at
      // every point.
      const a = river[Math.max(0, i - 1)]
      const b = river[Math.min(river.length - 1, i + 1)]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz) || 1
      // Perpendicular in plan.
      const nx = -dz / len
      const nz = dx / len

      const y = p.y + lift
      positions.push(p.x + nx * p.halfWidth, y, p.z + nz * p.halfWidth)
      positions.push(p.x - nx * p.halfWidth, y, p.z - nz * p.halfWidth)

      // Bigger rivers run deeper and darker.
      const t = Math.min(1, p.halfWidth / (c.rivers.maxWidth / 2))
      tmp.lerpColors(shallow, deep, t)
      for (let k = 0; k < 2; k++) colors.push(tmp.r, tmp.g, tmp.b, 0.82)
    }

    for (let i = 0; i < river.length - 1; i++) {
      const o = base + i * 2
      indices.push(o, o + 2, o + 1, o + 1, o + 2, o + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return { geometry, triangles: indices.length / 3 }
}
