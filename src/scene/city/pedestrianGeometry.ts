import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cityConfig } from '@/config'

/**
 * A walking figure (plan §20): three boxes, 36 triangles, standing on y = 0
 * and facing +Z like everything else in the city.
 *
 * Legs are painted dark in the geometry's vertex colours while the torso and
 * head are left white, so the per-person clothing colour arriving on
 * `instanceColor` reads as a top rather than as a full-body dye. At this scale
 * that is the entire difference between a crowd and a row of coloured pegs.
 */

const DARK: [number, number, number] = [0.34, 0.34, 0.38]
const PAINT: [number, number, number] = [1, 1, 1]

function part(
  w: number,
  h: number,
  d: number,
  y: number,
  rgb: [number, number, number],
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(0, y + h / 2, 0)
  const n = g.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    colors[i * 3] = rgb[0]
    colors[i * 3 + 1] = rgb[1]
    colors[i * 3 + 2] = rgb[2]
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

let cache: THREE.BufferGeometry | null = null

export function pedestrianGeometry(): THREE.BufferGeometry {
  if (!cache) {
    const { height: h, shoulders: w, depth: d } = cityConfig.pedestrians
    const legs = h * 0.46
    const head = h * 0.15
    const torso = h - legs - head
    cache = mergeGeometries([
      part(w * 0.78, legs, d * 0.85, 0, DARK),
      part(w, torso, d, legs, PAINT),
      part(w * 0.52, head, d * 0.8, legs + torso, PAINT),
    ])!
  }
  return cache
}

export function disposePedestrianGeometry(): void {
  cache?.dispose()
  cache = null
}
