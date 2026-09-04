import { cityConfig, type CityConfig, type CityDensity } from '@/config'
import { blockHalfExtent, districtReach, nearSeam, seamCoord } from './cityLayout'
import { rngFrom } from '@/utils/rng'
import type { Axis, CityLayout, PropKind, PropPlacement, StreetProps, TreePlacement, Vec2 } from './types'

/**
 * Street planting and furniture (plan §16).
 *
 * Placement is derived from the walkway strips the roads themselves generated,
 * never from independent coordinates, so a tree can no more drift into the
 * asphalt than a lane marking can. The rules are deliberately few:
 *
 *   - every street is tree-lined for its full run at one spacing, and lamp-lit
 *     at a longer stride outside the detailed inner ring;
 *   - only the avenues get benches and bins, because that is where the plan
 *     puts the foreground detail the camera actually sees;
 *   - nothing stands within `junctionClearance` of a junction, which is the
 *     same test that suppresses road paint there;
 *   - bollards ring the plaza, marking it as the tower's forecourt.
 *
 * Density thins by widening spacing rather than by dropping the outermost
 * items: a distance-sorted slice would leave a visible circle where the
 * planting stopped.
 */

/** Yaw that turns a prop modelled facing +Z toward the road beside it. */
export function faceRoadYaw(axis: Axis, side: -1 | 1): number {
  // Rotating +Z by θ about Y gives (sin θ, cos θ). An 'ew' walkway's road lies
  // at -side in z; an 'ns' walkway's lies at -side in x.
  return axis === 'ew' ? (side === 1 ? Math.PI : 0) : (-side * Math.PI) / 2
}

/** Place a point on a walkway: `along` runs with the road, `lateral` across it. */
function onWalkway(axis: Axis, along: number, lateral: number): Vec2 {
  return axis === 'ew' ? { x: along, z: lateral } : { x: lateral, z: along }
}

/**
 * Walk a strip at a fixed spacing, skipping junctions.
 *
 * `phase` shifts the whole run along the road, which is how lamps end up
 * between the trees rather than inside them.
 */
function stepsAlong(
  reach: number,
  spacing: number,
  phase: number,
  clearance: number,
  c: CityConfig,
): number[] {
  const out: number[] = []
  const count = Math.floor((reach * 2) / spacing)
  for (let i = 0; i < count; i++) {
    const along = -reach + spacing * (i + 0.5) + phase
    if (Math.abs(along) > reach) continue
    if (nearSeam(along, clearance, c)) continue
    out.push(along)
  }
  return out
}

/**
 * As above, but thinning past `inner` instead of running at one spacing.
 *
 * The distance that matters is the PROP'S, not its street's. An avenue's
 * centreline is a few tens of units from the tower and its far end is two and
 * a half thousand, so testing the street put four hundred lamps down the
 * outer reaches of four roads at the spacing meant for the middle of town —
 * a quarter of the scene's whole triangle budget lighting empty streets.
 */
function stepsThinning(
  reach: number,
  inner: number,
  spacing: number,
  outerScale: number,
  phase: number,
  clearance: number,
  c: CityConfig,
): number[] {
  const near = stepsAlong(Math.min(reach, inner), spacing, phase, clearance, c)
  if (reach <= inner) return near
  const wide = spacing * outerScale
  const out = [...near]
  for (const sign of [-1, 1]) {
    const span = reach - inner
    const count = Math.floor(span / wide)
    for (let i = 0; i < count; i++) {
      const along = sign * (inner + wide * (i + 0.5)) + phase
      if (Math.abs(along) > reach) continue
      if (nearSeam(along, clearance, c)) continue
      out.push(along)
    }
  }
  return out
}

function tree(
  id: string,
  position: Vec2,
  baseY: number,
  c: CityConfig,
  detail: 'near' | 'far' = 'near',
): TreePlacement {
  const rng = rngFrom(`${c.seed}:tree:${id}`)
  const { height, canopyRadius } = c.props.tree
  return {
    id,
    position,
    baseY,
    height: rng.range(height.min, height.max),
    canopyRadius: rng.range(canopyRadius.min, canopyRadius.max),
    // Canopies are lumpy rather than round, so a yaw actually changes the
    // silhouette; without it a row of trees reads as one stamp repeated.
    rotationY: rng.range(0, Math.PI * 2),
    variant: rng.next(),
    detail,
  }
}

function prop(
  kind: PropKind,
  id: string,
  position: Vec2,
  baseY: number,
  rotationY: number,
): PropPlacement {
  return { id, kind, position, baseY, rotationY }
}

/**
 * Trees and lamps along every walkway, plus benches and bins on the avenues.
 */
function buildStreetLine(
  layout: CityLayout,
  kerbTop: number,
  scale: number,
  blocked: Vec2[],
  c: CityConfig,
): StreetProps {
  const trees: TreePlacement[] = []
  const furniture: PropPlacement[] = []
  const inner = districtReach(c)
  const avenue = seamCoord(c.grid.midRadius, c)
  const clearance = c.props.junctionClearance
  const { treeSpacing, lampSpacing, benchSpacing, binSpacing, kerbOffset } = c.props
  const { outerLampScale } = c.props
  // Shelters are placed first and are far wider than a tree pit, so the street
  // line yields to them rather than growing a tree through a bus stop.
  const clearOf = (p: Vec2) =>
    blocked.every((b) => Math.hypot(p.x - b.x, p.z - b.z) > c.props.shelterClearance)

  for (const walk of layout.sidewalks) {
    const main = walk.roadClass === 'main'
    // Every street is planted for its whole run, at the same spacing as the
    // tower's own. A longer stride out here was the first attempt and it still
    // read as bare road; the trees are made cheaper with distance instead.
    // Lamps do thin outwards — there is no cheap lamp.
    const outer = !main && Math.abs(walk.center) > inner
    const stride = scale
    const reach = avenue
    // Kerb side for planting and lighting; building side for seating, so a
    // bench faces the traffic across the footway rather than sitting in it.
    const kerbLateral = walk.center - walk.side * kerbOffset
    const backLateral = walk.center + walk.side * kerbOffset
    const yaw = faceRoadYaw(walk.axis, walk.side)

    for (const along of stepsAlong(reach, treeSpacing * stride, 0, clearance, c)) {
      const p = onWalkway(walk.axis, along, kerbLateral)
      if (!clearOf(p)) continue
      // Measured from the tree, not the street: an avenue runs the width of
      // the grid, and its far end is as distant as any side street's.
      const detail = Math.max(Math.abs(p.x), Math.abs(p.z)) > inner ? 'far' : 'near'
      trees.push(tree(`${walk.id}-t${Math.round(along)}`, p, kerbTop, c, detail))
    }

    const lampStep = lampSpacing * scale
    const lampSteps = outer
      ? stepsAlong(reach, lampStep * outerLampScale, lampStep / 2, clearance, c)
      : stepsThinning(reach, inner, lampStep, outerLampScale, lampStep / 2, clearance, c)
    for (const along of lampSteps) {
      const p = onWalkway(walk.axis, along, kerbLateral)
      if (!clearOf(p)) continue
      furniture.push(prop('lamp', `${walk.id}-l${Math.round(along)}`, p, kerbTop, yaw))
    }

    if (!main) continue
    // Seating and bins are foreground detail: they stop at the inner ring even
    // though the avenue's trees carry on.
    for (const along of stepsAlong(inner, benchSpacing * scale, 0, clearance, c)) {
      const p = onWalkway(walk.axis, along, backLateral)
      if (!clearOf(p)) continue
      furniture.push(prop('bench', `${walk.id}-b${Math.round(along)}`, p, kerbTop, yaw))
    }
    const binStep = binSpacing * scale
    for (const along of stepsAlong(inner, binStep, binStep / 3, clearance, c)) {
      const p = onWalkway(walk.axis, along, kerbLateral)
      if (!clearOf(p)) continue
      furniture.push(prop('bin', `${walk.id}-n${Math.round(along)}`, p, kerbTop, yaw))
    }
  }

  return { trees, furniture }
}

/** Bollards around the plaza edge, separating the forecourt from the footway. */
function buildBollards(kerbTop: number, scale: number, c: CityConfig): PropPlacement[] {
  const out: PropPlacement[] = []
  const half = blockHalfExtent(c)
  const spacing = c.props.bollardSpacing * scale
  const count = Math.max(1, Math.floor((half * 2) / spacing))
  const step = (half * 2) / count

  for (let i = 0; i < count; i++) {
    const t = -half + step * (i + 0.5)
    for (const side of [-1, 1] as const) {
      out.push(prop('bollard', `bollard-ew-${side}-${i}`, { x: t, z: side * half }, kerbTop, 0))
      out.push(prop('bollard', `bollard-ns-${side}-${i}`, { x: side * half, z: t }, kerbTop, 0))
    }
  }
  return out
}

/**
 * Bus shelters on the avenue walkways facing the plaza, half a block either
 * side of the tower so both are in frame from the default camera.
 */
function buildBusStops(kerbTop: number, c: CityConfig): PropPlacement[] {
  const out: PropPlacement[] = []
  const lateral = seamCoord(-1, c) + c.roads.mainHalfWidth + c.roads.sidewalkWidth / 2
  const offset = c.grid.pitch / 4

  for (let i = 0; i < c.props.busStops; i++) {
    const along = i === 0 ? -offset : offset
    const axis: Axis = i === 0 ? 'ew' : 'ns'
    // Both stand on the plaza-facing walkway of the avenue on seam -1, which
    // is that road's +1 side; a shelter opens toward the kerb it serves.
    out.push(
      prop('busStop', `busstop-${i}`, onWalkway(axis, along, lateral), kerbTop, faceRoadYaw(axis, 1)),
    )
  }
  return out
}

/**
 * Build every prop in the city. Pure and deterministic — the same layout and
 * density always yield the same planting.
 */
export function buildStreetProps(
  layout: CityLayout,
  density: CityDensity,
  levels: { kerbTop: number },
  c: CityConfig = cityConfig,
): StreetProps {
  const scale = c.density[density].propScale
  const busStops = buildBusStops(levels.kerbTop, c)
  const street = buildStreetLine(
    layout,
    levels.kerbTop,
    scale,
    busStops.map((s) => s.position),
    c,
  )

  return {
    trees: street.trees,
    furniture: [...street.furniture, ...buildBollards(levels.kerbTop, scale, c), ...busStops],
  }
}
