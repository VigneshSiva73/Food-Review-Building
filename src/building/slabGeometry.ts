import { buildingConfig, materialsConfig, slabOverhang, type BuildingConfig } from '@/config'
import type { FloorLayout, Vec3 } from '@/types'

type HeroConcrete = typeof materialsConfig.heroConcrete

/**
 * Pure vertex data for the tilted triangular slab plates (plan §15).
 *
 * Each slab is a planar prism: the underside passes exactly through the three
 * pillar tops, wrapped outward in-plane by `slabOverhang` so the plate covers
 * the pillar heads, extruded along the plane normal by
 * `slabThickness`. Non-indexed triangles → flat shading after
 * computeVertexNormals().
 */

export interface SlabGeometryData {
  /** Non-indexed triangle soup, xyz per vertex. */
  positions: Float32Array
  /** floorIndex per vertex — used by raycasting to resolve face → floor. */
  floorIndex: Float32Array
  /**
   * Texture coordinates in tile counts, derived from world dimensions so the
   * concrete has the same grain on a plate of any size.
   */
  uv: Float32Array
  /**
   * Baked shading, rgb per vertex, multiplied into the plate's colour.
   *
   * This is the app's ambient occlusion. There is no postprocessing pass and
   * the shadow map is frozen after one render, so the darkness under a plate
   * has to be part of the plate.
   */
  shade: Float32Array
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })

/** Slab corners pushed outward in-plane by `overhang` (visual plate extent). */
export function extendedCorners(corners: [Vec3, Vec3, Vec3], overhang: number): [Vec3, Vec3, Vec3] {
  const centroid = scale(
    corners.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }),
    1 / 3,
  )
  return corners.map((p) => {
    const dir = { x: p.x - centroid.x, y: p.y - centroid.y, z: p.z - centroid.z }
    const len = Math.hypot(dir.x, dir.y, dir.z)
    return len === 0 ? p : add(p, scale(dir, overhang / len))
  }) as [Vec3, Vec3, Vec3]
}

/**
 * A slightly larger copy of a floor's slab, for selection highlights.
 *
 * Inflating in place matters: slab vertices are absolute world positions, so
 * scaling the mesh instead would scale about the scene origin and slide the
 * highlight metres up the tower — it would land on a different floor.
 */
export function inflateSlab(floor: FloorLayout, d: number): FloorLayout {
  const n = floor.slab.normal
  return {
    ...floor,
    slab: {
      ...floor.slab,
      corners: extendedCorners(floor.slab.corners, d).map((p) => ({
        x: p.x - n.x * d,
        y: p.y - n.y * d,
        z: p.z - n.z * d,
      })) as [Vec3, Vec3, Vec3],
      thickness: floor.slab.thickness + 2 * d,
    },
  }
}

/**
 * The plate outline: every edge pushed out in-plane by `radius`, and each
 * corner swept round the column on a true circular arc of that same radius.
 *
 * The plate used to be a uniformly scaled triangle with its corners filleted.
 * That model made two things one number: scaling a triangle outward moves its
 * EDGES by half what it moves its corners, so the plate always reached much
 * further past a column than past the middle of an elevation — and filleting
 * then cut the corner back again, which had to be paid for by scaling out
 * further still. The columns ended up buried deepest exactly where they are
 * most visible, and a bigger corner radius pushed every elevation out with it.
 *
 * Wrapping the column instead collapses that to one honest quantity: `radius`
 * is the distance from a column centre to the plate edge, everywhere. The
 * columns sit the same small distance inside the edge on the elevations and at
 * the corners, and the corner is a real 120° arc rather than a shallow cut.
 *
 * The arc is built by rotating the two edge normals into one another inside
 * the slab's own tilted plane, so — like the fillet before it — every point it
 * produces stays exactly on the soffit plane. `radius` must exceed a column's
 * half-diagonal or the plate stops covering the column heads; a test pins it.
 */
export function plateOutline(
  corners: [Vec3, Vec3, Vec3],
  radius: number,
  segments: number,
): Vec3[] {
  if (radius <= 0 || segments < 1) return [...corners]
  const centroid = scale(
    corners.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }),
    1 / 3,
  )

  /** Unit in-plane normal of edge (a, b), pointing away from the centroid. */
  const edgeNormal = (a: Vec3, b: Vec3): Vec3 => {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
    const away = { x: mid.x - centroid.x, y: mid.y - centroid.y, z: mid.z - centroid.z }
    // Project `away` off the edge direction: what remains is in-plane, since
    // both inputs are, and perpendicular to the edge.
    const dd = d.x * d.x + d.y * d.y + d.z * d.z
    const k = (away.x * d.x + away.y * d.y + away.z * d.z) / dd
    const n = { x: away.x - d.x * k, y: away.y - d.y * k, z: away.z - d.z * k }
    const len = Math.hypot(n.x, n.y, n.z)
    return { x: n.x / len, y: n.y / len, z: n.z / len }
  }

  const n = corners.length
  const normals = corners.map((a, i) => edgeNormal(a, corners[(i + 1) % n]))

  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    // The arc at corner i runs from the previous edge's offset to this one's.
    const e0 = normals[(i - 1 + n) % n]
    const e1 = normals[i]
    const dot = Math.min(1, Math.max(-1, e0.x * e1.x + e0.y * e1.y + e0.z * e1.z))
    const sweep = Math.acos(dot)
    const sinSweep = Math.sin(sweep)
    for (let step = 0; step <= segments; step++) {
      const t = step / segments
      // Slerp, so the points sit on a circle rather than on the chord between
      // the two normals — a lerp would flatten the arc toward its ends.
      const w0 = sinSweep < 1e-9 ? 1 - t : Math.sin((1 - t) * sweep) / sinSweep
      const w1 = sinSweep < 1e-9 ? t : Math.sin(t * sweep) / sinSweep
      out.push({
        x: corners[i].x + (e0.x * w0 + e1.x * w1) * radius,
        y: corners[i].y + (e0.y * w0 + e1.y * w1) * radius,
        z: corners[i].z + (e0.z * w0 + e1.z * w1) * radius,
      })
    }
  }
  return out
}

/**
 * Fillet the corners of a closed, coplanar polygon.
 *
 * Each corner is replaced by a quadratic Bézier whose control point is the
 * corner itself and whose ends sit `radius` back along the two adjacent edges.
 * A Bézier rather than a true circular arc for one reason that matters here:
 * every point it produces is a weighted average of three coplanar points, so
 * the result is guaranteed to stay exactly in the slab's tilted plane. Fitting
 * a circle in 3D would need a basis and would drift off-plane by whatever the
 * arithmetic lost — and "every vertex lies on the soffit plane" is a contract
 * the wedge depends on.
 *
 * The radius is clamped to a third of the shorter adjacent edge, so a corner
 * can never swallow its neighbour on a narrow plate.
 */
export function roundCorners(pts: Vec3[], radius: number, segments: number): Vec3[] {
  const n = pts.length
  if (radius <= 0 || segments < 1 || n < 3) return [...pts]

  const out: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]

    const toPrev = { x: prev.x - cur.x, y: prev.y - cur.y, z: prev.z - cur.z }
    const toNext = { x: next.x - cur.x, y: next.y - cur.y, z: next.z - cur.z }
    const lenPrev = Math.hypot(toPrev.x, toPrev.y, toPrev.z)
    const lenNext = Math.hypot(toNext.x, toNext.y, toNext.z)
    if (lenPrev === 0 || lenNext === 0) {
      out.push(cur)
      continue
    }
    const r = Math.min(radius, lenPrev / 3, lenNext / 3)
    const a = add(cur, scale(toPrev, r / lenPrev))
    const b = add(cur, scale(toNext, r / lenNext))

    for (let s = 0; s <= segments; s++) {
      const t = s / segments
      const w0 = (1 - t) * (1 - t)
      const w1 = 2 * (1 - t) * t
      const w2 = t * t
      out.push({
        x: a.x * w0 + cur.x * w1 + b.x * w2,
        y: a.y * w0 + cur.y * w1 + b.y * w2,
        z: a.z * w0 + cur.z * w1 + b.z * w2,
      })
    }
  }
  return out
}

/** Points in one plate's outline once its corners are filleted. */
export function slabOutlineLength(c: BuildingConfig = buildingConfig): number {
  return c.plateEdgeRadius > 0 ? 3 * (c.plateCornerSegments + 1) : 3
}

/**
 * Vertices one floor contributes to the merged slab buffer.
 *
 * Exported so the scene's draw-range reveal cannot disagree with what is
 * actually written. It was a hand-copied 24 in two files until the plate gained
 * rounded corners, at which point one of them would have been wrong.
 *
 * Per outline point: three for the bottom fan, three for the top fan, six for
 * the side quad.
 */
export function slabVertsPerFloor(c: BuildingConfig = buildingConfig): number {
  return slabOutlineLength(c) * 12
}

export function buildSlabGeometry(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
  m: HeroConcrete = materialsConfig.heroConcrete,
): SlabGeometryData {
  const vertsPerSlab = slabVertsPerFloor(c)
  const positions = new Float32Array(floors.length * vertsPerSlab * 3)
  const floorIndex = new Float32Array(floors.length * vertsPerSlab)
  const uv = new Float32Array(floors.length * vertsPerSlab * 2)
  const shade = new Float32Array(floors.length * vertsPerSlab * 3)
  const tile = m.tileWorldSize

  let v = 0
  /**
   * `u`/`vCoord` are already in tile counts; `tone` is the baked shade.
   *
   * Everything a vertex carries is written in one place on purpose. The four
   * arrays are addressed by the same running counter, and the picking contract
   * depends on them staying exactly parallel — a face resolves to its floor by
   * reading `floorIndex` at `faceIndex * 3`.
   */
  const push = (p: Vec3, fi: number, u: number, vCoord: number, tone: number) => {
    positions[v * 3] = p.x
    positions[v * 3 + 1] = p.y
    positions[v * 3 + 2] = p.z
    floorIndex[v] = fi
    uv[v * 2] = u
    uv[v * 2 + 1] = vCoord
    shade[v * 3] = tone
    shade[v * 3 + 1] = tone
    shade[v * 3 + 2] = tone
    v++
  }

  /** Horizontal faces map straight off the world plan, so plates never seam. */
  const planar = (p: Vec3, fi: number, tone: number) =>
    push(p, fi, p.x / tile, p.z / tile, tone)

  for (const floor of floors) {
    const { corners, thickness } = floor.slab
    const fi = floor.floorIndex
    // Filleted in the slab's own tilted plane, so the soffit stays planar and
    // the three vertical arrises of the tower lose their knife edge.
    const b = plateOutline(corners, slabOverhang(c), c.plateCornerSegments)
    // Tilted soffit, flat top. The underside still passes through the pillar
    // tops (that tilt is the data), but the plate now fills all the way up to
    // the module ceiling, which is exactly where the next day's columns start.
    // Previously the top face was parallel to the soffit, leaving an open void
    // between each slab and the floor above that grew as ratings fell.
    const t = b.map((p) => ({
      x: p.x,
      y: Math.max(floor.deckY, p.y + thickness),
      z: p.z,
    }))

    const n = b.length
    const mid = (pts: Vec3[]): Vec3 => ({
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      z: pts.reduce((s, p) => s + p.z, 0) / pts.length,
    })
    const bc = mid(b)
    const tc = mid(t)

    // Both horizontal faces are now fans from their own centre: a filleted
    // outline is no longer a triangle, so it cannot be one. Bottom is wound
    // in reverse to face down, and is uniformly the darkest surface here —
    // the fan does give it a centre vertex, but a gradient toward the rim
    // would read as a lit soffit, which is the opposite of the truth.
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      planar(bc, fi, m.soffitShade)
      planar(b[j], fi, m.soffitShade)
      planar(b[i], fi, m.soffitShade)

      planar(tc, fi, 1)
      planar(t[i], fi, 1)
      planar(t[j], fi, 1)
    }

    // Side wall, one quad per outline segment, outward-facing.
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const run = Math.hypot(b[j].x - b[i].x, b[j].y - b[i].y, b[j].z - b[i].z) / tile
      // Height is measured from the floor's own datum, not from world zero, so
      // the grain stays put on the edge when the explode view lifts the plate.
      const rise = (p: Vec3) => (p.y - floor.baseY) / tile
      const wall = (p: Vec3, u: number, tone: number) => push(p, fi, u, rise(p), tone)

      wall(b[i], 0, m.edgeShade)
      wall(b[j], run, m.edgeShade)
      wall(t[j], run, 1)
      wall(b[i], 0, m.edgeShade)
      wall(t[j], run, 1)
      wall(t[i], 0, 1)
    }
  }

  return { positions, floorIndex, uv, shade }
}
