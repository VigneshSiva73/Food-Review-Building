import { buildingConfig, slabOverhang, type BuildingConfig } from '@/config'
import type { FloorLayout, SlabLayout, Vec3 } from '@/types'
import { plateOutline as platePlan } from './slabGeometry'
import type { InstanceTransform } from './matrices'
import { variationFor } from './variation'

/**
 * Facade band builders (plan §§13–14): between each tilted slab top and the
 * next flat deck sits a variable-height clerestory — planar glass quads plus
 * instanced mullion fins. The band's height varies inversely with the pillar
 * heights, giving the rating a second, free visual channel. Also built here:
 * fascia beams wrapping the tilted slab edges and capital blocks covering
 * every pillar/slab joint.
 */

/**
 * Vertical elevation of the slab's UNDERSIDE at horizontal point (x, z).
 *
 * This is the plane through the three pillar tops, so it is where a day's
 * open storey is closed off from above — and therefore the ceiling of
 * everything that lives inside the floor.
 */
export function slabSoffitY(x: number, z: number, slab: SlabLayout): number {
  const c0 = slab.corners[0]
  const n = slab.normal
  return c0.y - (n.x * (x - c0.x) + n.z * (z - c0.z)) / n.y
}

/** Vertical elevation of the slab's TOP face at horizontal point (x, z). */
export function slabTopY(x: number, z: number, slab: SlabLayout): number {
  return slabSoffitY(x, z, slab) + slab.thickness / slab.normal.y
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

/**
 * The glazing outline in plan: the plate edge, at y = 0.
 *
 * This is deliberately the SAME outline the plate and its fascia beam use, so
 * the glass finishes flush with the slab edge on every elevation, with no
 * ledge between them. Only the three straight runs are glazed; see
 * `straightRuns` for why the corners are left open.
 *
 * It has been in two wrong places before. First it was set back about 1.3 from
 * the column centrelines, which left a gap at every column. Moving it onto the
 * column line closed that gap but left the plate still reaching 1.85 further
 * out, so each storey read as a dark slot recessed behind a pale ledge. Only
 * the plate edge itself makes the two agree.
 *
 * The columns are consequently behind the glazing rather than standing proud
 * of it. That is the accepted trade: there is no line that is both flush with
 * the plate and outboard of the columns, because the plate has to overhang far
 * enough to cover the column heads.
 */
function plateOutline(floor: FloorLayout, c: BuildingConfig): Vec3[] {
  const corners = floor.pillars.map((p) => ({ x: p.base.x, y: 0, z: p.base.z })) as [
    Vec3,
    Vec3,
    Vec3,
  ]
  return platePlan(corners, slabOverhang(c), c.plateCornerSegments)
}

/**
 * Indices of the three straight runs in a filleted plate outline.
 *
 * `plateOutline` emits `segments + 1` points per corner — the arc wrapping
 * that column — and the run to the NEXT corner is the segment leaving the last
 * of them. So every (segments+1)th segment is a long elevation and the rest
 * are arc chords. Derived from the config that shapes the outline rather than
 * measured off it, so the two cannot silently disagree.
 *
 * Only these are glazed. The corner arcs are left open, which is what lets
 * each column show through in a full-height slot: the columns sit just inside
 * the glass line and would otherwise be buried by it, and they carry the meal
 * ratings.
 */
function straightRuns(c: BuildingConfig): number[] {
  if (c.plateEdgeRadius <= 0) return [0, 1, 2]
  const period = c.plateCornerSegments + 1
  return [0, 1, 2].map((corner) => corner * period + period - 1)
}

/**
 * Vertices one floor contributes to the merged glazing buffer.
 *
 * Exported for the same reason `slabVertsPerFloor` is: the construction
 * reveal advances the draw range by this number, and a hand-copied 18 in the
 * scene would have silently disagreed the moment the outline gained corners.
 */
export function glassVertsPerFloor(c: BuildingConfig = buildingConfig): number {
  // Three elevations plus two returns per corner, six vertices each.
  return (straightRuns(c).length + cornerReturns(c).length) * 6
}

/**
 * The short panes that carry the glazing off each elevation and into the
 * column at the corner.
 *
 * Without them the glass stops on the elevation plane, which at a corner is
 * `plateEdgeRadius` out from the column centre while the column's own face is
 * only half its width out — so an open slot showed down each side of every
 * column, and the glass visibly failed to reach the thing it was supposed to
 * die into. A return is what a real curtain wall does at an expressed column:
 * it turns the corner into the reveal and lands on the column.
 *
 * Each return runs from a tangent point on the plate outline in to the column
 * WALL, stopping a hair inside it so the two overlap rather than risk a gap.
 *
 * They used to run to the column centre. That was forced by a square section:
 * finding where an in-plane radial line meets an axis-aligned box is fiddly
 * and differs at every corner, so burying the pane was the safe answer. It
 * also made the columns disappear — the panes are smoked glass, and a pane
 * sweeping the whole corner tints the column behind it dark from every angle,
 * which is the opposite of leaving the column on show. A round column has one
 * radius in every direction, so the wall is now trivial to stop at.
 *
 * The two returns at a corner are radial and 120° apart, so the sector between
 * them — the one facing outward along the bisector — stays open. That is the
 * slot the column shows through, and it is untouched by this.
 */
function cornerReturns(c: BuildingConfig): { outlinePoint: number; column: number }[] {
  if (c.plateEdgeRadius <= 0) return []
  const period = c.plateCornerSegments + 1
  return [0, 1, 2].flatMap((corner) => [
    // First point of this corner's arc: where the previous elevation ended.
    { outlinePoint: corner * period, column: corner },
    // Last point: where the next elevation begins.
    { outlinePoint: corner * period + c.plateCornerSegments, column: corner },
  ])
}

export interface GlassGeometryData {
  positions: Float32Array
  /** floorIndex per vertex — lets raycasting resolve face → floor. */
  floorIndex: Float32Array
  /** Per-vertex tint carrying that day's seeded occupancy variation. */
  tint: Float32Array
  /**
   * Curtain-wall UVs, so the glazing can carry a lit-window map after dark.
   *
   * `u` runs along each elevation, normalised to the length of a straight run
   * so a short corner return shows windows at the same spacing as the wall it
   * turns off rather than a compressed stripe of them. `v` is the floor: each
   * storey samples its OWN row of the map, which is what stops every floor
   * lighting the same panes. Without these the tower had no UVs at all, so any
   * emissive lit the entire curtain wall uniformly — the flat slab.
   */
  uv: Float32Array
}

/**
 * Floor and ceiling of a day's glazed volume at one point in plan.
 *
 * `baseY` is the flat top of the plate below, not an approximation of it:
 * `buildSlabGeometry` raises every plate's top face to `deckY`, and the next
 * module's `baseY` IS that `deckY`. So the glass lands exactly on concrete,
 * and it does so using only the floor's own numbers — which is what keeps it
 * with its floor when the exploded view pulls the stack apart.
 *
 * The obvious-looking alternative is what produced the black speckling across
 * every plate: `slabTopY` returns the top of a plate extruded PARALLEL to its
 * tilted soffit, which is below the flat `deckY` the geometry actually builds.
 * Starting the glass there buried its bottom edge inside the plate below, and
 * two surfaces in the same place is z-fighting.
 */
/**
 * How many storeys of window pattern the map holds before it repeats.
 *
 * Sixteen, so a tower of any realistic height never shows the same floor twice
 * within one screenful. One row per floor is what §11 of the brief asks for:
 * floors that are mostly dark next to floors with a few rooms lit.
 */
export const GLASS_TILE_FLOORS = 16

function glazingSpan(floor: FloorLayout, x: number, z: number) {
  const bottom = floor.baseY
  const top = slabSoffitY(x, z, floor.slab)
  return { bottom, top: Math.max(top, bottom) }
}

/**
 * Smoked glazing filling each day's open storey, out at the plate edge.
 *
 * It fills the volume the columns stand in — deck top up to the underside of
 * the plate — and not the band above the plate. An earlier version glazed
 * slab-top to next-deck, which put a clerestory ribbon between days; that band
 * was removed from the design, and the stale span survived here for a long
 * time only because nothing rendered it.
 *
 * Because the ceiling follows the soffit, the glass is taller under a
 * well-rated meal and shorter under a poor one. The rating drives it, exactly
 * as the columns do, and the glass never becomes an independent channel.
 *
 * In plan it runs along `plateOutline` — see the note there for why it sits on
 * the plate edge rather than behind it.
 */
export function buildGlassGeometry(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): GlassGeometryData {
  const vertsPerFloor = glassVertsPerFloor(c)
  const positions = new Float32Array(floors.length * vertsPerFloor * 3)
  const floorIndex = new Float32Array(floors.length * vertsPerFloor)
  const tint = new Float32Array(floors.length * vertsPerFloor * 3)
  const uv = new Float32Array(floors.length * vertsPerFloor * 2)
  let v = 0
  let n = 0
  let currentFloor = 0
  let currentTint = 1
  const push = (p: Vec3, u: number, w: number) => {
    positions[v++] = p.x
    positions[v++] = p.y
    positions[v++] = p.z
    tint[n * 3] = currentTint
    tint[n * 3 + 1] = currentTint
    tint[n * 3 + 2] = currentTint
    uv[n * 2] = u
    uv[n * 2 + 1] = w
    floorIndex[n++] = currentFloor
  }

  for (const floor of floors) {
    currentFloor = floor.floorIndex
    // Floors are not equally occupied; this is what stops a stack of identical
    // panes reading as one extruded ribbon.
    currentTint = variationFor(floor.date, c).litFactor
    const outline = plateOutline(floor, c)
    // Every elevation is measured against the same reference length, so a
    // corner return shows the same window spacing as the wall it turns off.
    const runs = straightRuns(c)
    const first = outline[runs[0]]
    const second = outline[(runs[0] + 1) % outline.length]
    const referenceRun = Math.hypot(second.x - first.x, second.z - first.z) || 1
    // Each storey gets its own row of the map. Modulo, so the pattern is
    // stable per floor rather than drifting with dataset length.
    const row = ((floor.floorIndex % GLASS_TILE_FLOORS) + GLASS_TILE_FLOORS) % GLASS_TILE_FLOORS
    const v0 = row / GLASS_TILE_FLOORS
    const v1 = (row + 1) / GLASS_TILE_FLOORS

    const pane = (a: Vec3, b: Vec3) => {
      const sa = glazingSpan(floor, a.x, a.z)
      const sb = glazingSpan(floor, b.x, b.z)
      const ab: Vec3 = { x: a.x, y: sa.bottom, z: a.z }
      const bb: Vec3 = { x: b.x, y: sb.bottom, z: b.z }
      const at: Vec3 = { x: a.x, y: sa.top, z: a.z }
      const bt: Vec3 = { x: b.x, y: sb.top, z: b.z }
      const u1 = Math.hypot(b.x - a.x, b.z - a.z) / referenceRun
      // Two triangles, outward winding (corner order is CCW from above).
      push(ab, 0, v0)
      push(bb, u1, v0)
      push(bt, u1, v1)
      push(ab, 0, v0)
      push(bt, u1, v1)
      push(at, 0, v1)
    }

    for (const i of straightRuns(c)) {
      pane(outline[i], outline[(i + 1) % outline.length])
    }
    for (const { outlinePoint, column } of cornerReturns(c)) {
      const pillar = floor.pillars[column]
      const edge = outline[outlinePoint]
      const dx = edge.x - pillar.base.x
      const dz = edge.z - pillar.base.z
      const len = Math.hypot(dx, dz) || 1
      // A hair inside the wall, so the pane dies into opaque concrete instead
      // of stopping on it and leaving a hairline of daylight.
      const reach = ((pillar.isData ? c.pillarWidth : c.supportWidth) / 2) * 0.98
      pane(edge, {
        x: pillar.base.x + (dx / len) * reach,
        y: 0,
        z: pillar.base.z + (dz / len) * reach,
      })
    }
  }
  return { positions, floorIndex, tint, uv }
}

/**
 * Instances tagged with the floor that produced them, so the construction
 * animation can reveal them floor-by-floor (plan §29).
 */
export interface FloorTaggedInstances<T> {
  transforms: T[]
  floorOf: number[]
}

/**
 * Vertical fins standing proud of the glazing (centred unit-box instances).
 *
 * They share the glazing's span and its line exactly, so a fin never projects
 * past the glass it belongs to. Spacing is architectural rather than a curtain-wall
 * module: closely-repeated fins turn into a comb at any distance where the
 * whole tower is in frame, and the tower is almost always in frame.
 *
 * `rotY` puts local +z along the edge, so `scale.z` is the fin's thickness and
 * `scale.x` is how far it projects — the opposite of what the names suggest,
 * which is why both are read explicitly here.
 */
export function buildMullionInstances(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): FloorTaggedInstances<InstanceTransform> {
  const out: InstanceTransform[] = []
  const floorOf: number[] = []

  for (const floor of floors) {
    const { mullionPhase } = variationFor(floor.date, c)
    const outline = plateOutline(floor, c)
    // Spaced by arc length across the three glazed elevations, not per segment.
    // Per-segment placement puts a minimum number of fins on each of the tiny
    // chords a filleted corner is made of, which clusters every corner while
    // the long elevations stay sparse. The corners carry no fins at all now:
    // they carry no glass either, so a fin there would stand in the open slot
    // in front of the column it exists to expose.
    const runs = straightRuns(c).map((i) => {
      const a = outline[i]
      const b = outline[(i + 1) % outline.length]
      return { a, b, len: Math.hypot(b.x - a.x, b.z - a.z) }
    })
    const glazed = runs.reduce((t, r) => t + r.len, 0)
    const count = Math.max(3, Math.round(glazed / c.mullionSpacing))
    for (let m = 0; m < count; m++) {
      const target = ((m + mullionPhase) / count) * glazed
      let run = 0
      let travelled = 0
      while (run < runs.length - 1 && travelled + runs[run].len < target) {
        travelled += runs[run].len
        run++
      }
      const { a, b, len } = runs[run]
      const p = lerp(a, b, len === 0 ? 0 : (target - travelled) / len)
      const rotY = Math.atan2(b.x - a.x, b.z - a.z)
      const { bottom, top } = glazingSpan(floor, p.x, p.z)
      const height = top - bottom
      if (height <= 0.05) continue
      out.push({
        position: { x: p.x, y: bottom + height / 2, z: p.z },
        scale: { x: c.mullionDepth, y: height, z: c.mullionWidth },
        rotY,
      })
      floorOf.push(floor.floorIndex)
    }
  }
  return { transforms: out, floorOf }
}

export interface AlignedTransform extends InstanceTransform {
  /** Unit direction the instance's local +z axis should align to. */
  align: Vec3
  /**
   * Direction the instance's local +y should lean toward, orthogonalised
   * against `align`.
   *
   * Optional, and only matters for a profiled section. `align` alone fixes two
   * of three degrees of freedom; the roll about the beam axis is then whatever
   * the minimal rotation between +z and `align` happens to produce, which
   * varies from edge to edge. A square box does not care. A beam with a reveal
   * on top and a drip notch underneath very much does — without this, the two
   * would land in a different place on each of a floor's three edges.
   */
  up?: Vec3
}

/** Graphite fascia beams along the three tilted slab edges. */
export function buildFasciaInstances(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): FloorTaggedInstances<AlignedTransform> {
  const out: AlignedTransform[] = []
  const floorOf: number[] = []

  for (const floor of floors) {
    const { fasciaFactor } = variationFor(floor.date, c)
    // Follows the plate's own outline, not its three original corners. A
    // rounded plate wrapped by a beam that still turns a sharp corner is worse
    // than either on its own — the beam is the strongest line on the
    // elevation, so it is the one that has to follow the curve.
    const outer = platePlan(floor.slab.corners, slabOverhang(c), c.plateCornerSegments)
    // Mid-thickness of the plate, along its normal.
    const n = floor.slab.normal
    const half = floor.slab.thickness / 2
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i]
      const b = outer[(i + 1) % outer.length]
      const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
      const len = Math.hypot(d.x, d.y, d.z)
      out.push({
        position: {
          x: (a.x + b.x) / 2 + n.x * half,
          y: (a.y + b.y) / 2 + n.y * half,
          z: (a.z + b.z) / 2 + n.z * half,
        },
        scale: { x: c.fasciaWidth, y: c.fasciaHeight * fasciaFactor, z: len },
        rotY: 0,
        align: { x: d.x / len, y: d.y / len, z: d.z / len },
        // The slab's own normal, so the beam's top face lies in the plate's
        // plane on all three edges. Left to the minimal rotation, the reveal
        // and the drip notch land somewhere different on each edge — and on a
        // tilted floor, sometimes facing into the building.
        up: n,
      })
      floorOf.push(floor.floorIndex)
    }
  }
  return { transforms: out, floorOf }
}

/** Capital blocks covering each pillar/slab joint (plan §16). */
export function buildCapitalInstances(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): FloorTaggedInstances<InstanceTransform> {
  const out: InstanceTransform[] = []
  const floorOf: number[] = []
  for (const floor of floors) {
    for (const p of floor.pillars) {
      const width = (p.isData ? c.pillarWidth : c.supportWidth) * c.capitalWidthFactor
      out.push({
        // Centred on the contact point: half embeds in the slab, half caps the pillar.
        position: { x: p.base.x, y: p.base.y + p.height, z: p.base.z },
        scale: { x: width, y: c.capitalHeight, z: width },
        rotY: 0,
      })
      floorOf.push(floor.floorIndex)
    }
  }
  return { transforms: out, floorOf }
}

/**
 * Concrete downstand ribs spanning column to column beneath the plate.
 *
 * The ribs hang below the soffit plane, offset along the negative slab normal
 * by half their depth. They are emphatically not at the module base: a ring of
 * beams on that datum was built once and removed, because it read as a floor
 * slab between days and this building does not have one. Everything here is
 * derived from the floor's own soffit — the pillar-top corners and the plate
 * normal — so it stays attached through the explode view.
 *
 * Each rib stops short of the joint heads at either end, so the two do not
 * intersect at the column.
 */
export function buildSoffitRibInstances(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): FloorTaggedInstances<AlignedTransform> {
  const out: AlignedTransform[] = []
  const floorOf: number[] = []

  for (const floor of floors) {
    const n = floor.slab.normal
    const drop = c.soffitRibDepth / 2
    for (let i = 0; i < 3; i++) {
      const a = floor.slab.corners[i]
      const b = floor.slab.corners[(i + 1) % 3]
      const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
      const len = Math.hypot(d.x, d.y, d.z)
      // Clear the joint head at each end rather than running through it.
      const clear = Math.max(len * 0.2, len - c.pillarWidth * c.capitalWidthFactor)
      out.push({
        position: {
          x: (a.x + b.x) / 2 - n.x * drop,
          y: (a.y + b.y) / 2 - n.y * drop,
          z: (a.z + b.z) / 2 - n.z * drop,
        },
        scale: { x: c.soffitRibWidth, y: c.soffitRibDepth, z: clear },
        rotY: 0,
        align: { x: d.x / len, y: d.y / len, z: d.z / len },
        // Same basis the edge beams use, so a rib's depth runs straight down
        // from the plate rather than straight down in world space.
        up: n,
      })
      floorOf.push(floor.floorIndex)
    }
  }
  return { transforms: out, floorOf }
}

/**
 * A copy of one floor's glazing pushed out along each pane's own normal.
 *
 * The selection overlay used to cover the plate alone, so hovering a floor lit
 * its slab and left the storey under it unchanged — most of what a floor
 * actually is. Highlighting the glass too needs a shell that sits just in
 * front of the real panes, and a radial push from the tower's axis will not do
 * it: the two return panes at each corner are themselves radial, so pushing
 * them outward slides them along their own plane and they z-fight the glass
 * they are meant to cover.
 *
 * The buffer is a triangle soup, so every vertex belongs to exactly one
 * triangle and can take that triangle's own normal. Vertices shared between
 * two panes are duplicated in the data and each copy moves with its own face,
 * which is what keeps the corners closed.
 */
export function inflateGlass(positions: Float32Array, offset: number): Float32Array {
  const out = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5]
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len > 0) {
      nx = (nx / len) * offset
      ny = (ny / len) * offset
      nz = (nz / len) * offset
    } else {
      nx = ny = nz = 0
    }
    for (let k = 0; k < 9; k += 3) {
      out[i + k] = positions[i + k] + nx
      out[i + k + 1] = positions[i + k + 1] + ny
      out[i + k + 2] = positions[i + k + 2] + nz
    }
  }
  return out
}
