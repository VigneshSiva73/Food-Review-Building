import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cityConfig } from '@/config'
import type { VehicleKind } from '@/city'

/**
 * Vehicle bodies (plan §18). One merged geometry per kind, modelled facing +Z
 * with its wheels on y = 0 — the same convention as the street furniture, so
 * a route's heading can be used as a yaw directly.
 *
 * Glazing and the wheel line are painted into the geometry's vertex colours
 * while the bodywork is left white. Per-vehicle paint then arrives on
 * `instanceColor`, and the two multiply in the shader: every car in the fleet
 * gets its own colour with dark windows, out of one material and one draw
 * call per kind.
 */

/** Multiplied by the per-instance paint colour, so 1 means "show the paint". */
const PAINT: [number, number, number] = [1, 1, 1]
const GLASS: [number, number, number] = [0.17, 0.2, 0.25]
const WHEELS: [number, number, number] = [0.12, 0.12, 0.14]

function part(
  w: number,
  h: number,
  l: number,
  y: number,
  z: number,
  rgb: [number, number, number],
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, l)
  g.translate(0, y + h / 2, z)
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

function buildCar(w: number, h: number, l: number): THREE.BufferGeometry {
  const skirt = h * 0.24
  const cabin = h * 0.34
  const body = h - skirt - cabin
  return mergeGeometries([
    part(w * 0.94, skirt, l * 0.94, 0, 0, WHEELS),
    part(w, body, l, skirt, 0, PAINT),
    // Cabin set back from the nose, which is what reads as a bonnet.
    part(w * 0.88, cabin, l * 0.48, skirt + body, -l * 0.06, GLASS),
  ])!
}

function buildBoxy(w: number, h: number, l: number): THREE.BufferGeometry {
  const skirt = h * 0.17
  const body = h - skirt
  return mergeGeometries([
    part(w * 0.94, skirt, l * 0.96, 0, 0, WHEELS),
    part(w, body, l, skirt, 0, PAINT),
    // A window band standing a hair proud of the bodywork, rather than flush
    // with it: coplanar faces at this scale z-fight from halfway across the
    // district.
    part(w * 1.008, h * 0.3, l * 0.84, skirt + body * 0.52, 0, GLASS),
  ])!
}

const cache = new Map<VehicleKind, THREE.BufferGeometry>()

export function vehicleGeometry(kind: VehicleKind): THREE.BufferGeometry {
  let geom = cache.get(kind)
  if (!geom) {
    const { width, height, length } = cityConfig.traffic.sizes[kind]
    geom = kind === 'car' ? buildCar(width, height, length) : buildBoxy(width, height, length)
    cache.set(kind, geom)
  }
  return geom
}

export function disposeVehicleGeometry(): void {
  for (const g of cache.values()) g.dispose()
  cache.clear()
}
