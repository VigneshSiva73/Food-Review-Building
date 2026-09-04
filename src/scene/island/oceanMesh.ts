import * as THREE from 'three'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { heightAt, type HeightField } from '@/terrain/heightField'

/**
 * The sea, in two parts.
 *
 * A single flat plane cannot do what §4 and §5 ask for. The water has to be
 * pale over the sand and dark over the deeps, and it has to be see-through
 * close in so the beach continues under it instead of stopping dead at the
 * waterline. Both of those are functions of the SEABED, which means the water
 * needs vertices where the seabed changes — near the island — and none at all
 * out where it is uniformly deep.
 *
 * So: a graded shallow sheet over the island's own extent, carrying depth in
 * its vertex colours and alpha, laid over one enormous opaque plane that runs
 * to the horizon. Two draw calls, and the expensive one covers only the part
 * anybody can see detail in.
 */

const SCRATCH = new THREE.Color()
const A = new THREE.Color()
const B = new THREE.Color()

function ramp(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Deep water, well away from any coast. */
export const DEEP_WATER = '#123a5e'

export interface OceanMeshes {
  shallow: THREE.BufferGeometry
  deep: THREE.BufferGeometry
  triangles: number
}

export function buildOceanMeshes(
  field: HeightField,
  resolution: number,
  deepHalfExtent: number,
  c: IslandConfig = islandConfig,
): OceanMeshes {
  const half = field.half
  const step = (half * 2) / (resolution - 1)
  const count = resolution * resolution
  const sea = c.world.seaLevel

  const positions = new Float32Array(count * 3)
  /**
   * How much swell this vertex may carry, in [0, 1].
   *
   * Zero at the waterline, because water does not heave where it is a hand
   * deep — it would lift the sheet off the sand and open a gap along every
   * beach. Zero again at the sheet's own boundary, so the swell dies out
   * before the sheet meets the flat horizon plane rather than tearing away
   * from it. Full in between, which is the open shallows.
   */
  const waveMask = new Float32Array(count)
  // Four components: the fourth is alpha, which is what lets the sand show
  // through the shallows. Three.js reads a size-4 colour attribute as RGBA.
  const colors = new Float32Array(count * 4)

  const shallowTone = new THREE.Color('#3f8fa6')
  const midTone = new THREE.Color('#1d5f80')
  const deepTone = new THREE.Color(DEEP_WATER)

  for (let j = 0; j < resolution; j++) {
    const z = -half + j * step
    for (let i = 0; i < resolution; i++) {
      const x = -half + i * step
      const n = j * resolution + i
      positions[n * 3] = x
      positions[n * 3 + 1] = 0
      positions[n * 3 + 2] = z

      // Depth of water at this point. Negative over dry land, where the sheet
      // is simply hidden by the terrain standing above it.
      const depth = sea - heightAt(field, x, z)

      A.copy(shallowTone)
      B.copy(midTone)
      SCRATCH.lerpColors(A, B, ramp(4, 70, depth))
      A.copy(SCRATCH)
      B.copy(deepTone)
      SCRATCH.lerpColors(A, B, ramp(80, 300, depth))

      colors[n * 4] = SCRATCH.r
      colors[n * 4 + 1] = SCRATCH.g
      colors[n * 4 + 2] = SCRATCH.b
      // Clear at the waterline, opaque by the time the bottom is out of sight.
      // §5's gradient is this number and nothing else.
      // Faded out at the sheet's own boundary, so it dissolves into the deep
      // plane beneath instead of ending in a visible square step — which is
      // exactly what a hard edge looked like the first time.
      const edge = Math.max(Math.abs(x), Math.abs(z)) / half
      // Faded over a wide band rather than a narrow one, so there is no line
      // for the eye to find even if the two surfaces ever drift apart again.
      const boundary = 1 - ramp(0.62, 0.96, edge)
      colors[n * 4 + 3] = (0.28 + 0.72 * ramp(2, 130, depth)) * boundary
      waveMask[n] = ramp(6, 90, depth) * boundary
    }
  }

  const quads = (resolution - 1) * (resolution - 1)
  const indices = new Uint32Array(quads * 6)
  let k = 0
  for (let j = 0; j < resolution - 1; j++) {
    for (let i = 0; i < resolution - 1; i++) {
      const a = j * resolution + i
      const b = a + 1
      const cc = a + resolution
      const dd = cc + 1
      indices[k++] = a
      indices[k++] = cc
      indices[k++] = b
      indices[k++] = b
      indices[k++] = cc
      indices[k++] = dd
    }
  }

  const shallow = new THREE.BufferGeometry()
  shallow.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  shallow.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  shallow.setAttribute('waveMask', new THREE.BufferAttribute(waveMask, 1))
  shallow.setIndex(new THREE.BufferAttribute(indices, 1))
  shallow.computeVertexNormals()
  shallow.computeBoundingSphere()

  const deep = new THREE.PlaneGeometry(deepHalfExtent * 2, deepHalfExtent * 2)
  deep.rotateX(-Math.PI / 2)

  return { shallow, deep, triangles: quads * 2 + 2 }
}
