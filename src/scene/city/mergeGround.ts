import * as THREE from 'three'
import { COVER_TINTS, type GroundPatch, type GroundQuad, type GroundSlab } from '@/city'

/**
 * Merge flat rectangles and slabs into single buffers.
 *
 * The whole road surface becomes one draw call, every painted line another,
 * and so on — which is what keeps a district of this size affordable
 * (plan §35). Geometry is non-indexed with constant up-normals; nothing here
 * needs smooth shading.
 */

const VERTS_PER_QUAD = 6

/**
 * Ground cover: the same flat rectangles, but carrying a vertex colour.
 *
 * One buffer for every lawn, meadow and garden in the city. They differ only
 * in tint, so a colour attribute keeps them on one draw call instead of three
 * — and the environment is at 26 of the 28 it is allowed.
 */
export function patchesToGeometry(patches: GroundPatch[]): THREE.BufferGeometry {
  const positions = new Float32Array(patches.length * VERTS_PER_QUAD * 3)
  const normals = new Float32Array(patches.length * VERTS_PER_QUAD * 3)
  const colors = new Float32Array(patches.length * VERTS_PER_QUAD * 3)
  const tint = new THREE.Color()
  let v = 0

  for (const p of patches) {
    tint.set(COVER_TINTS[p.kind])
    const x0 = p.cx - p.halfW
    const x1 = p.cx + p.halfW
    const z0 = p.cz - p.halfD
    const z1 = p.cz + p.halfD
    // Same winding as `quadsToGeometry`, and for the same reason: the obvious
    // corner order faces DOWN and is culled from every camera above it.
    const corners: [number, number][] = [
      [x0, z0],
      [x1, z1],
      [x1, z0],
      [x0, z0],
      [x0, z1],
      [x1, z1],
    ]
    for (const [x, z] of corners) {
      positions[v * 3] = x
      positions[v * 3 + 1] = p.y
      positions[v * 3 + 2] = z
      normals[v * 3 + 1] = 1
      colors[v * 3] = tint.r
      colors[v * 3 + 1] = tint.g
      colors[v * 3 + 2] = tint.b
      v++
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geom
}

/** One flat, upward-facing rectangle per quad. */
export function quadsToGeometry(quads: GroundQuad[]): THREE.BufferGeometry {
  const positions = new Float32Array(quads.length * VERTS_PER_QUAD * 3)
  const normals = new Float32Array(quads.length * VERTS_PER_QUAD * 3)
  let v = 0

  for (const q of quads) {
    const x0 = q.cx - q.halfW
    const x1 = q.cx + q.halfW
    const z0 = q.cz - q.halfD
    const z1 = q.cz + q.halfD
    // Winding matters: (a,b,c) with a=(x0,z0), b=(x1,z0), c=(x1,z1) gives
    // ab x ac = (0, -w*d, 0) — a face pointing DOWN, which is back-face culled
    // from any camera above the ground. Ordering z before x flips the cross
    // product to +y.
    const corners: [number, number][] = [
      [x0, z0],
      [x1, z1],
      [x1, z0],
      [x0, z0],
      [x0, z1],
      [x1, z1],
    ]
    for (const [x, z] of corners) {
      positions[v * 3] = x
      positions[v * 3 + 1] = q.y
      positions[v * 3 + 2] = z
      normals[v * 3 + 1] = 1
      v++
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geom
}

/**
 * Slabs as a top face plus four vertical sides — the sides are the kerb.
 * The underside is omitted: it is never visible and would double the cost.
 */
export function slabsToGeometry(slabs: GroundSlab[]): THREE.BufferGeometry {
  const faces = 5
  const positions = new Float32Array(slabs.length * faces * VERTS_PER_QUAD * 3)
  let v = 0

  const push = (x: number, y: number, z: number) => {
    positions[v * 3] = x
    positions[v * 3 + 1] = y
    positions[v * 3 + 2] = z
    v++
  }
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    push(...a)
    push(...b)
    push(...c)
    push(...a)
    push(...c)
    push(...d)
  }

  for (const s of slabs) {
    const x0 = s.cx - s.halfW
    const x1 = s.cx + s.halfW
    const z0 = s.cz - s.halfD
    const z1 = s.cz + s.halfD
    const { y0, y1 } = s

    // Top face wound for a +y normal, same reason as the flat quads above.
    // The four kerb faces below are already wound outward.
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]) // top
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]) // +z kerb
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]) // -z kerb
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]) // +x kerb
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]) // -x kerb
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  return geom
}
