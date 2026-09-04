import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { GroundQuad, GroundSlab } from '@/city'
import { quadsToGeometry, slabsToGeometry } from './mergeGround'

/**
 * Winding regression.
 *
 * The first cut of these builders wound every horizontal face clockwise seen
 * from above, giving it a -y normal. Three.js culls back faces by default, so
 * the entire road surface and every walkway top was invisible from any camera
 * above the ground — while the geometry, the materials and the layout were all
 * perfectly correct. It cost a long hunt to find, so it is pinned here.
 */

/** Geometric normal of triangle `t`, derived from vertex order alone. */
function faceNormal(geom: THREE.BufferGeometry, t: number): THREE.Vector3 {
  const pos = geom.getAttribute('position')
  const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3)
  const b = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 1)
  const c = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 2)
  return new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize()
}

const triangleCount = (geom: THREE.BufferGeometry) => geom.getAttribute('position').count / 3

describe('quadsToGeometry', () => {
  const quads: GroundQuad[] = [
    { cx: 0, cz: 0, halfW: 10, halfD: 4, y: 0.5 },
    { cx: -30, cz: 12, halfW: 2, halfD: 40, y: 0.5 },
  ]
  const geom = quadsToGeometry(quads)

  it('emits two triangles per quad', () => {
    expect(triangleCount(geom)).toBe(quads.length * 2)
  })

  it('faces up, so it is not back-face culled from above', () => {
    for (let t = 0; t < triangleCount(geom); t++) {
      expect(faceNormal(geom, t).y).toBeCloseTo(1)
    }
  })

  it('agrees with the normals it declares', () => {
    const normals = geom.getAttribute('normal')
    for (let i = 0; i < normals.count; i++) {
      expect(normals.getY(i)).toBeCloseTo(1)
    }
  })

  it('lays every vertex at the requested height', () => {
    const pos = geom.getAttribute('position')
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(0.5)
  })
})

describe('slabsToGeometry', () => {
  const slab: GroundSlab = { cx: 5, cz: -5, halfW: 3, halfD: 8, y0: 0, y1: 0.15 }
  const geom = slabsToGeometry([slab])

  it('emits a top plus four kerb faces', () => {
    expect(triangleCount(geom)).toBe(5 * 2)
  })

  it('points its top up and every kerb outward', () => {
    const normals = Array.from({ length: triangleCount(geom) }, (_, t) => faceNormal(geom, t))
    const top = normals.filter((n) => n.y > 0.9)
    expect(top).toHaveLength(2)

    // The four sides must face away from the slab centre, never inward.
    const centre = new THREE.Vector3(slab.cx, 0, slab.cz)
    const pos = geom.getAttribute('position')
    for (let t = 0; t < normals.length; t++) {
      const n = normals[t]
      if (n.y > 0.9) continue
      const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3)
      const outward = new THREE.Vector3(a.x - centre.x, 0, a.z - centre.z)
      expect(n.dot(outward)).toBeGreaterThan(0)
    }
  })

  it('spans from the ground to the kerb top', () => {
    geom.computeBoundingBox()
    expect(geom.boundingBox!.min.y).toBeCloseTo(slab.y0)
    expect(geom.boundingBox!.max.y).toBeCloseTo(slab.y1)
  })
})
