import * as THREE from 'three'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { heightAt, type HeightField } from '@/terrain/heightField'
import { vegetationAt } from '@/terrain/vegetation'

/**
 * The island as one indexed mesh.
 *
 * The generation grid is finer than the render grid on purpose. Drainage needs
 * 25-unit cells to route water sensibly, but half a million triangles of static
 * ground is not worth drawing — so the mesh samples the field at a coarser
 * spacing and the fine detail lives on in the elevations it interpolates and in
 * the vertex colours, which are read from the FULL-resolution field.
 *
 * One buffer, one draw call, no shadow casting. The sun's shadow map is
 * rendered once and frozen around the tower; ground this size would spend the
 * whole map on empty hillside.
 */

export interface TerrainMesh {
  geometry: THREE.BufferGeometry
  triangles: number
}

const SCRATCH = new THREE.Color()
const A = new THREE.Color()
const B = new THREE.Color()

function ramp(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Ground colour from height, steepness and wetness together.
 *
 * All three matter and none of them alone is enough: height gives the broad
 * bands, steepness puts rock on anything too sheer to hold soil whatever its
 * altitude, and the drainage's own flow figure darkens the ground along the
 * watercourses. Colouring by height alone is what produces the layer-cake look
 * the brief calls out in §17.
 */
function groundColour(
  height: number,
  slope: number,
  wetness: number,
  shelf: number,
  forest: number,
  peak: number,
  c: IslandConfig,
): THREE.Color {
  const sea = c.world.seaLevel

  if (height <= sea) {
    // Seabed, read through the water. Pale close in so shallows look shallow.
    A.set('#243b4e')
    B.set('#7e8a76')
    return SCRATCH.lerpColors(A, B, ramp(sea - 90, sea, height))
  }

  const above = height - sea

  // The shore, decided by SLOPE as much as by height — which is what §3 is
  // really asking for when it says beach width should vary and some coast
  // should be rock. Gentle ground at the waterline collects sand and collects
  // a lot of it; steep ground sheds it and comes out as cliff. One rule, and
  // the coastline gets wide bays of beach, narrow strips, and rocky headlands
  // without any of the three being placed.
  const gentle = 1 - ramp(0.22, 0.72, slope)
  const sandBand = 10 + 34 * gentle

  A.set('#8f8467')
  B.set('#d8c9a2')
  // Wet sand at the waterline drying out up the beach.
  SCRATCH.lerpColors(A, B, ramp(1, 12, above))
  const sand = SCRATCH.clone()

  // Coastal scrub, then grass inland.
  A.set('#8a9464')
  B.set('#5c7245')
  const vegetation = SCRATCH.lerpColors(A, B, ramp(90, 260, above)).clone()

  // Sand gives way to vegetation over the width the slope allowed.
  A.copy(sand)
  B.copy(vegetation)
  SCRATCH.lerpColors(A, B, ramp(sandBand * 0.55, sandBand, above))

  // Higher ground dries out and greys off toward rock.
  A.copy(SCRATCH)
  B.set('#7a7360')
  SCRATCH.lerpColors(A, B, ramp(peak * 0.42, peak * 0.72, height))
  A.copy(SCRATCH)
  B.set('#9a9690')
  SCRATCH.lerpColors(A, B, ramp(peak * 0.78, peak * 0.97, height))

  // Steep ground is rock at any altitude — §7, §28 and the coastal cliffs of
  // §31, which need no separate machinery: a steep slope meeting the water IS
  // a cliff, and colouring it as one is the whole of it.
  A.copy(SCRATCH)
  B.set('#6f6a5e')
  SCRATCH.lerpColors(A, B, ramp(0.5, 1.15, slope))

  // Forest floor, from the SAME suitability field the trees are placed by — so
  // the ground darkens exactly where the canopy is and never anywhere else. At
  // the distance an island is looked at, this is what actually reads as forest;
  // the trees themselves are barely a couple of pixels each.
  if (forest > 0) {
    A.copy(SCRATCH)
    B.set('#33502c')
    SCRATCH.lerpColors(A, B, forest * 0.82)
  }

  // Damp ground along the watercourses, and the channels themselves.
  if (wetness > 0) {
    A.copy(SCRATCH)
    B.set('#41543c')
    SCRATCH.lerpColors(A, B, wetness * 0.75)
  }

  // The city's own ground wash, so the join at the shelf edge is not a seam.
  //
  // Green, not the bare earth it used to be. Everything that is not paving in
  // this city is grass — verges, gardens, the parks, the land between the
  // houses — and a brown plain showing between them read as a building site
  // rather than as a city. It is a duller, greyer green than the parks' own so
  // that a mown lawn still reads as mown against it.
  if (shelf > 0) {
    A.copy(SCRATCH)
    B.set('#53663f')
    SCRATCH.lerpColors(A, B, shelf)
  }
  return SCRATCH
}

export function buildTerrainMesh(
  field: HeightField,
  resolution: number,
  c: IslandConfig = islandConfig,
): TerrainMesh {
  const half = field.half
  const step = (half * 2) / (resolution - 1)
  const count = resolution * resolution

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const heights = new Float32Array(count)

  let peak = 0
  for (let i = 0; i < field.height.length; i++) if (field.height[i] > peak) peak = field.height[i]

  for (let j = 0; j < resolution; j++) {
    const z = -half + j * step
    for (let i = 0; i < resolution; i++) {
      const x = -half + i * step
      const n = j * resolution + i
      const h = heightAt(field, x, z)
      heights[n] = h
      positions[n * 3] = x
      positions[n * 3 + 1] = h
      positions[n * 3 + 2] = z
    }
  }

  // Sample the FULL-resolution field for wetness and shelf, so a river that the
  // render grid is too coarse to show as geometry still shows as ground colour.
  const cellOf = (x: number, z: number) => {
    const i = Math.min(field.size - 1, Math.max(0, Math.round((x + field.half) / field.step)))
    const j = Math.min(field.size - 1, Math.max(0, Math.round((z + field.half) / field.step)))
    return j * field.size + i
  }

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const n = j * resolution + i
      const l = heights[j * resolution + Math.max(0, i - 1)]
      const r = heights[j * resolution + Math.min(resolution - 1, i + 1)]
      const d = heights[Math.max(0, j - 1) * resolution + i]
      const u = heights[Math.min(resolution - 1, j + 1) * resolution + i]
      const slope = Math.hypot((r - l) / (2 * step), (u - d) / (2 * step))

      const x = -half + i * step
      const z = -half + j * step
      const cell = cellOf(x, z)
      const wetness = Math.min(1, Math.sqrt(field.flow[cell]) / 90)
      const forest = vegetationAt(field, x, z, c)
      const colour = groundColour(heights[n], slope, wetness, field.shelf[cell], forest, peak, c)
      colors[n * 3] = colour.r
      colors[n * 3 + 1] = colour.g
      colors[n * 3 + 2] = colour.b
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

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return { geometry, triangles: quads * 2 }
}

/**
 * The ocean: two triangles, far past anything else.
 *
 * Wide enough that it reaches the horizon from any camera the app allows, and
 * wide enough to cover the terrain mesh's own square boundary — which is below
 * sea level all the way round, so the edge of the world is underwater and
 * cannot be seen. §35 asks for exactly that.
 */
export function buildOceanGeometry(halfExtent: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(halfExtent * 2, halfExtent * 2)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}
