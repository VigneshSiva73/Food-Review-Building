import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cityConfig } from '@/config'

/**
 * Shared geometry for street planting and furniture (plan §16).
 *
 * Every geometry stands on y = 0 with its origin at the point where it meets
 * the ground, so an instance transform is just "put it here, turn it that
 * way" — no per-prop vertical bookkeeping, and nothing can end up half sunk
 * in the pavement.
 *
 * Props modelled facing +Z. `faceRoadYaw` in the pure layer rotates them
 * toward the kerb, so the lamp arm reaches over the traffic and a bench looks
 * across the footway rather than into a wall.
 *
 * Multi-part props are merged into one buffer rather than nested: an
 * InstancedMesh draws one geometry, and a lamp built from three meshes would
 * be three draw calls and three instance buffers for no visual gain.
 */

const cache = new Map<string, THREE.BufferGeometry>()

function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = cache.get(key)
  if (!geom) {
    geom = build()
    cache.set(key, geom)
  }
  return geom
}

/** A box placed by its centre. */
function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

/** A vertical cylinder standing on y = `base`. */
function post(
  rTop: number,
  rBottom: number,
  h: number,
  base: number,
  seg = 8,
  x = 0,
  z = 0,
  openEnded = false,
) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, openEnded)
  g.translate(x, base + h / 2, z)
  return g
}

/**
 * Unit trunk: one tall, so a y scale is the trunk height directly. Six sides
 * is plenty — at any camera distance where the facets would show, the canopy
 * has already hidden most of the trunk.
 *
 * Open-ended, which halves it. Both caps were pure waste: the bottom one is
 * buried in the tree pit and the top one is inside the canopy. At a few
 * thousand trees that is fifty thousand triangles of geometry nobody can see.
 */
export function treeTrunkGeometry(): THREE.BufferGeometry {
  return cached('trunk', () => post(0.17, 0.26, 1, 0, 6, 0, 0, true))
}

/**
 * Unit canopy: an icosahedron normalised to span exactly ±1 across and 0–2 up,
 * so a scale of (r, h/2, r) fills precisely the volume the pure layer asked
 * for. Detail 0 is deliberate — the facets read as foliage clumps and cost 20
 * triangles.
 *
 * The normalisation is not cosmetic. `IcosahedronGeometry(1)` puts its
 * *vertices* on the unit sphere, but its bounding box only reaches ~0.851,
 * so translating by 1 would leave every canopy hanging that fraction of its
 * height clear of the trunk. Rescaling from the measured bounds keeps the
 * contract true whatever primitive is used here later.
 */
export function treeCanopyGeometry(): THREE.BufferGeometry {
  return cached('canopy', () => {
    const g = new THREE.IcosahedronGeometry(1, 0)
    g.computeBoundingBox()
    g.scale(...(Array(3).fill(1 / g.boundingBox!.max.y) as [number, number, number]))
    g.translate(0, 1, 0)
    return g
  })
}

/**
 * Cheap canopy: an octahedron, normalised the same way so it is a drop-in
 * replacement for the icosahedron above.
 *
 * Eight triangles against twenty. Up close the facets read as a crystal rather
 * than as foliage, which is exactly why it is only used past the inner ring —
 * out there a canopy covers a handful of pixels and the silhouette is all that
 * survives.
 */
export function treeCanopyFarGeometry(): THREE.BufferGeometry {
  return cached('canopy-far', () => {
    const g = new THREE.OctahedronGeometry(1, 0)
    g.computeBoundingBox()
    g.scale(...(Array(3).fill(1 / g.boundingBox!.max.y) as [number, number, number]))
    g.translate(0, 1, 0)
    return g
  })
}

/**
 * Curved coconut palm tree trunk: organic curved trunk standing from y=0 to y=1.
 */
export function coconutTrunkGeometry(): THREE.BufferGeometry {
  return cached('coconut-trunk', () => {
    const h = 1.0
    const g = new THREE.CylinderGeometry(0.11, 0.22, h, 8, 6, true)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + h / 2 // 0 to 1
      const curve = Math.sin((y / h) * Math.PI) * 0.14
      pos.setX(i, pos.getX(i) + curve)
      pos.setZ(i, pos.getZ(i) + curve * 0.4)
    }
    g.computeVertexNormals()
    g.translate(0, h / 2, 0)
    return g
  })
}

/**
 * Detailed Coconut Palm canopy: 8 arching palm frond leaves and a cluster of coconuts.
 * Spans 0..2 in Y, max radius 1 in XZ.
 */
export function coconutCanopyGeometry(): THREE.BufferGeometry {
  return cached('coconut-canopy', () => {
    const parts: THREE.BufferGeometry[] = []
    const frondCount = 6
    for (let i = 0; i < frondCount; i++) {
      const angle = (i * Math.PI * 2) / frondCount
      const leaf = new THREE.BoxGeometry(0.22, 0.04, 1.1)
      leaf.translate(0, -0.05, 0.55)
      leaf.rotateX(0.2)
      leaf.rotateY(angle)
      parts.push(leaf)
    }

    const coconutCoords = [
      [0.08, -0.08, 0.06],
      [-0.09, -0.07, 0.07],
      [0.02, -0.09, -0.1],
      [-0.06, -0.1, -0.05],
    ]
    for (const [cx, cy, cz] of coconutCoords) {
      const nut = new THREE.TetrahedronGeometry(0.09, 0)
      nut.translate(cx, cy, cz)
      parts.push(nut)
    }

    const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!
    merged.computeBoundingBox()
    const b = merged.boundingBox!
    const height = Math.max(b.max.y - b.min.y, 1e-4)
    const maxXZ = Math.max(
      Math.abs(b.max.x),
      Math.abs(b.min.x),
      Math.abs(b.max.z),
      Math.abs(b.min.z),
      1e-4,
    )
    merged.scale(1 / maxXZ, 2 / height, 1 / maxXZ)
    merged.computeBoundingBox()
    merged.translate(0, -merged.boundingBox!.min.y, 0)
    return merged
  })
}

/**
 * Far LOD Coconut Palm canopy: 6 radiating star fronds.
 * Spans 0..2 in Y, max radius 1 in XZ.
 */
export function coconutCanopyFarGeometry(): THREE.BufferGeometry {
  return cached('coconut-canopy-far', () => {
    const parts: THREE.BufferGeometry[] = []
    const frondCount = 6
    for (let i = 0; i < frondCount; i++) {
      const angle = (i * Math.PI * 2) / frondCount
      const leaf = new THREE.BoxGeometry(0.2, 0.04, 1.1)
      leaf.translate(0, -0.05, 0.55)
      leaf.rotateX(0.2)
      leaf.rotateY(angle)
      parts.push(leaf)
    }
    const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!
    merged.computeBoundingBox()
    const b = merged.boundingBox!
    const height = Math.max(b.max.y - b.min.y, 1e-4)
    const maxXZ = Math.max(
      Math.abs(b.max.x),
      Math.abs(b.min.x),
      Math.abs(b.max.z),
      Math.abs(b.min.z),
      1e-4,
    )
    merged.scale(1 / maxXZ, 2 / height, 1 / maxXZ)
    merged.computeBoundingBox()
    merged.translate(0, -merged.boundingBox!.min.y, 0)
    return merged
  })
}

/**
 * How far the lamp arm cantilevers over the road, in local +Z.
 *
 * Exported because the lit lens is a separate mesh with its own material and
 * has to land on the head, not beside it.
 */
export const LAMP_ARM_REACH = 1.5

/**
 * The lamp housing, in the lamp's local frame.
 *
 * Exported because the lit lens is a separate mesh with its own material and
 * has to sit immediately under this box — not inside it, which is where a
 * separately-guessed offset put it, hiding the light entirely.
 */
export const LAMP_HEAD = Object.freeze({
  width: 0.46,
  height: 0.2,
  depth: 0.9,
  /** Distance from the top of the post down to the centre of the housing. */
  drop: 0.28,
})

/** Post, cantilever arm and head, reaching out over the road. */
export function lampGeometry(): THREE.BufferGeometry {
  return cached('lamp', () => {
    const h = cityConfig.props.lampHeight
    const reach = LAMP_ARM_REACH
    const head = LAMP_HEAD
    return mergeGeometries([
      // Six sides rather than eight: the column is 180mm across, so the extra
      // facets cost a third of the lamp and show at no camera distance.
      post(0.09, 0.13, h, 0, 6),
      box(0.09, 0.09, reach, 0, h - 0.12, reach / 2),
      box(head.width, head.height, head.depth, 0, h - head.drop, reach),
    ])!
  })
}

/** Slatted seat, back and two legs. Seat faces +Z; the back is behind it. */
export function benchGeometry(): THREE.BufferGeometry {
  return cached('bench', () =>
    mergeGeometries([
      box(1.9, 0.1, 0.58, 0, 0.45, 0.02),
      box(1.9, 0.5, 0.09, 0, 0.72, -0.26),
      box(0.11, 0.45, 0.52, -0.78, 0.225, 0),
      box(0.11, 0.45, 0.52, 0.78, 0.225, 0),
    ])!,
  )
}

/** Litter bin: a tapered drum with a rim. */
export function binGeometry(): THREE.BufferGeometry {
  return cached('bin', () =>
    mergeGeometries([post(0.34, 0.27, 0.85, 0), post(0.37, 0.37, 0.08, 0.85)])!,
  )
}

/** Bollard: a short capped post. */
export function bollardGeometry(): THREE.BufferGeometry {
  return cached('bollard', () => {
    const h = cityConfig.props.bollardHeight
    return mergeGeometries([post(0.11, 0.13, h, 0, 6), post(0.14, 0.14, 0.07, h, 6)])!
  })
}

/** Bus shelter: canopy roof on four posts, closed at the back. */
export function busStopGeometry(): THREE.BufferGeometry {
  return cached('busStop', () => {
    const h = 2.75
    const halfW = 2.1
    const back = -0.85
    return mergeGeometries([
      box(halfW * 2, 0.14, 2.0, 0, h, 0.15),
      box(halfW * 2, h - 0.4, 0.08, 0, (h - 0.4) / 2, back),
      post(0.07, 0.07, h, 0, 6, -halfW + 0.12, back),
      post(0.07, 0.07, h, 0, 6, halfW - 0.12, back),
      post(0.07, 0.07, h, 0, 6, -halfW + 0.12, 1.05),
      post(0.07, 0.07, h, 0, 6, halfW - 0.12, 1.05),
      box(halfW * 1.5, 0.09, 0.42, 0, 0.5, back + 0.3),
    ])!
  })
}

/** Release every cached prop geometry. */
export function disposePropGeometry(): void {
  for (const g of cache.values()) g.dispose()
  cache.clear()
}
