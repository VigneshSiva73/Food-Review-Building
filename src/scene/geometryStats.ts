import type * as THREE from 'three'

/**
 * Triangles in a geometry — not vertices.
 *
 * Worth its own module because the obvious expression is wrong half the time.
 * `position.count / 3` counts triangles only for non-indexed geometry; on an
 * indexed one it is the vertex count over three, which is a different number
 * and not always a whole one. Both kinds are in use here: the hand-built ground
 * and facade buffers are non-indexed, while anything from three's primitives or
 * `mergeGeometries` is indexed.
 *
 * That mistake has already shipped once in a budget test, where it silently
 * under-reported every merged prop and left a triangle cap calibrated against
 * the wrong number.
 */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  const indexed = geometry.index
  return (indexed ? indexed.count : geometry.getAttribute('position').count) / 3
}
