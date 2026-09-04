import { cityConfig, type CityConfig } from '@/config'
import { seamCoord, seamHalfWidth } from './cityLayout'
import type {
  CityPaths,
  Crossing,
  Route,
  RoutePose,
  SignalPhase,
  SignalState,
  Vec2,
} from './types'

/**
 * Movement paths for traffic and pedestrians (plan §§14, 18, 20).
 *
 * Routes are closed rectangular loops running along the grid seams, offset to
 * a lane or a sidewalk. Vehicles never leave the asphalt and pedestrians never
 * leave the walkway because both are generated from the same seam coordinates
 * the roads themselves are built from — there is no independent placement that
 * could drift out of alignment.
 *
 * This module is pure geometry and timing. Nothing animates here; the scene
 * layer samples these with `poseAt` and `signalStateAt`.
 */

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

/** Measure a closed polyline, producing the cumulative table `poseAt` needs. */
export function makeRoute(id: string, points: Vec2[]): Route {
  const cumulative: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]))
  }
  // Closing leg back to the first point.
  const length = cumulative[cumulative.length - 1] + dist(points[points.length - 1], points[0])
  return { id, points, cumulative, length }
}

/** Flat pose, for the animation loop to reuse without allocating. */
export interface FlatPose {
  x: number
  z: number
  heading: number
}

/**
 * Sample a pose into a caller-owned object.
 *
 * The traffic loop samples every vehicle every frame, so this exists to keep
 * that path allocation-free; `poseAt` is the convenient wrapper for everything
 * that is not in the hot loop.
 */
export function poseInto(route: Route, distance: number, out: FlatPose): FlatPose {
  const { points, cumulative, length } = route
  const n = points.length
  if (n === 0) {
    out.x = 0
    out.z = 0
    out.heading = 0
    return out
  }
  if (n === 1 || length === 0) {
    out.x = points[0].x
    out.z = points[0].z
    out.heading = 0
    return out
  }

  let d = distance % length
  if (d < 0) d += length

  // Find the segment containing d. Linear scan: routes are a few dozen points
  // and this runs per vehicle per frame, where a binary search's branching
  // costs more than the scan saves.
  let i = 0
  while (i < n - 1 && cumulative[i + 1] <= d) i++

  const a = points[i]
  const b = points[(i + 1) % n]
  const segStart = cumulative[i]
  const segLen = (i === n - 1 ? length : cumulative[i + 1]) - segStart
  const t = segLen === 0 ? 0 : (d - segStart) / segLen

  const dx = b.x - a.x
  const dz = b.z - a.z
  out.x = a.x + dx * t
  out.z = a.z + dz * t
  out.heading = Math.atan2(dx, dz)
  return out
}

/**
 * Sample a pose at an arc-length position. Distances wrap, so callers can just
 * keep adding speed × delta forever without bookkeeping.
 */
export function poseAt(route: Route, distance: number): RoutePose {
  const p = poseInto(route, distance, { x: 0, z: 0, heading: 0 })
  return { position: { x: p.x, z: p.z }, heading: p.heading }
}

/**
 * A rectangular loop with rounded corners, at ±`extent` on both axes.
 *
 * `clockwise` selects the direction of travel; generating both directions from
 * the same extent is what puts opposing traffic on opposite sides of the
 * centreline without any extra bookkeeping.
 */
interface LoopBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function rectLoop(
  id: string,
  bounds: LoopBounds,
  radius: number,
  clockwise: boolean,
  segments: number,
): Route {
  // Four explicit sides rather than one radius. A square loop at radius R only
  // sits on roads while the grid is symmetric about the origin — and once block
  // widths began to vary it is not: the seam at index -b-1 is nowhere near
  // minus the seam at index b, so two of every loop's four sides ran through
  // the middle of blocks.
  const halfX = (bounds.maxX - bounds.minX) / 2
  const halfZ = (bounds.maxZ - bounds.minZ) / 2
  const cx = (bounds.maxX + bounds.minX) / 2
  const cz = (bounds.maxZ + bounds.minZ) / 2
  const r = Math.min(radius, halfX, halfZ)
  const innerX = halfX - r
  const innerZ = halfZ - r

  // Corner centres, counter-clockwise from the +x/+z quadrant.
  const corners: Vec2[] = [
    { x: cx + innerX, z: cz + innerZ },
    { x: cx - innerX, z: cz + innerZ },
    { x: cx - innerX, z: cz - innerZ },
    { x: cx + innerX, z: cz - innerZ },
  ]
  // Start angle of each corner's arc, matching the corner order above.
  const startAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

  const points: Vec2[] = []
  for (let ci = 0; ci < 4; ci++) {
    const corner = corners[ci]
    const a0 = startAngles[ci]
    for (let sgm = 0; sgm <= segments; sgm++) {
      const a = a0 + (sgm / segments) * (Math.PI / 2)
      points.push({ x: corner.x + Math.cos(a) * r, z: corner.z + Math.sin(a) * r })
    }
  }
  if (clockwise) points.reverse()
  return makeRoute(id, points)
}

/**
 * Vehicle loops on the grid seams. Each seam ring yields two routes, one per
 * direction, offset either side of the centreline so they read as lanes.
 */
export function buildVehicleRoutes(c: CityConfig = cityConfig): Route[] {
  const out: Route[] = []
  const { laneOffset } = c.roads
  const { cornerRadius, cornerSegments } = c.traffic

  for (let b = 0; b <= c.grid.midRadius; b++) {
    // The ring's four roads, each at its own seam: the positive and negative
    // sides sit at different distances now that block widths vary.
    const hi = seamCoord(b, c)
    const lo = seamCoord(-b - 1, c)
    // Right-hand traffic, with X east and Z south: on the southern leg of a
    // ring the outer lane is the one further south, and a driver keeping right
    // there is heading east. That is the clockwise winding, so the outer lane
    // runs clockwise and the inner lane returns anticlockwise.
    const out_ = { minX: lo - laneOffset, maxX: hi + laneOffset, minZ: lo - laneOffset, maxZ: hi + laneOffset }
    const in_ = { minX: lo + laneOffset, maxX: hi - laneOffset, minZ: lo + laneOffset, maxZ: hi - laneOffset }
    out.push(rectLoop(`veh-${b}-out`, out_, cornerRadius, true, cornerSegments))
    out.push(rectLoop(`veh-${b}-in`, in_, cornerRadius, false, cornerSegments))
  }
  return out
}

/**
 * Block perimeter loops: one circuit of the footway around each inner block.
 *
 * These have to be per-block, not one big rectangle per ring. A rectangle
 * drawn at some radius from the tower runs straight across every side street
 * it passes, which would march pedestrians over live traffic lanes at a dozen
 * unmarked intersections. A block circuit spans only between the walkway
 * centrelines of the four roads bounding that block, so by construction it
 * never reaches asphalt — and walking round the block is what people on foot
 * actually do.
 *
 * Corners are square. Rounding one with the vehicle corner radius would cut it
 * diagonally across a footway only three units wide.
 */
export function buildPedestrianRoutes(c: CityConfig = cityConfig): Route[] {
  const out: Route[] = []
  const r = c.grid.innerRadius

  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      // Inner edge of each bounding road's walkway, measured from that road's
      // own half-width: a block between a main avenue and a side street is not
      // symmetric, and pretending otherwise would put a leg on the asphalt.
      const x0 = seamCoord(bx - 1, c) + walkOffset(bx - 1, c)
      const x1 = seamCoord(bx, c) - walkOffset(bx, c)
      const z0 = seamCoord(bz - 1, c) + walkOffset(bz - 1, c)
      const z1 = seamCoord(bz, c) - walkOffset(bz, c)

      out.push(
        makeRoute(`ped-block-${bx}-${bz}`, [
          { x: x0, z: z0 },
          { x: x1, z: z0 },
          { x: x1, z: z1 },
          { x: x0, z: z1 },
        ]),
      )
    }
  }
  return out
}

/** Distance from a seam's centreline to its walkway centreline. */
function walkOffset(b: number, c: CityConfig): number {
  return seamHalfWidth(b, c) + c.roads.sidewalkWidth / 2
}

/**
 * Zebra crossings on the four approaches to each signalled junction — the
 * corners of the hero's block, which is where pedestrians actually are.
 */
export function buildCrossings(c: CityConfig = cityConfig): Crossing[] {
  const out: Crossing[] = []
  const { mainHalfWidth, crossingDepth } = c.roads
  const setback = mainHalfWidth + crossingDepth / 2

  for (const bx of [-1, 0]) {
    for (const bz of [-1, 0]) {
      const x = seamCoord(bx, c)
      const z = seamCoord(bz, c)
      for (const side of [-1, 1] as const) {
        out.push({
          id: `cross-ew-${bx}-${bz}-${side > 0 ? 'p' : 'n'}`,
          center: { x: x + side * setback, z },
          axis: 'ew',
          halfWidth: mainHalfWidth,
          depth: crossingDepth,
        })
        out.push({
          id: `cross-ns-${bx}-${bz}-${side > 0 ? 'p' : 'n'}`,
          center: { x, z: z + side * setback },
          axis: 'ns',
          halfWidth: mainHalfWidth,
          depth: crossingDepth,
        })
      }
    }
  }
  return out
}

/** Full signal cycle length in milliseconds. */
export function signalCycleMs(c: CityConfig = cityConfig): number {
  const { greenMs, yellowMs, redMs } = c.signals
  return greenMs + yellowMs + redMs
}

/**
 * Signals at the hero block's four corners. Opposite corners share a phase and
 * adjacent ones are offset by half a cycle, so crossing streams never both run
 * green — the cheap trick that makes the junction read as coordinated.
 */
export function buildSignals(c: CityConfig = cityConfig): SignalPhase[] {
  const cycle = signalCycleMs(c)
  const out: SignalPhase[] = []
  for (const bx of [-1, 0]) {
    for (const bz of [-1, 0]) {
      const paired = (bx + bz) % 2 === 0
      out.push({
        id: `signal-${bx}-${bz}`,
        center: { x: seamCoord(bx, c), z: seamCoord(bz, c) },
        offsetMs: paired ? 0 : cycle / 2,
      })
    }
  }
  return out
}

/** Signal colour at time `tMs`, for a given phase offset. */
export function signalStateAt(
  tMs: number,
  phase: SignalPhase,
  c: CityConfig = cityConfig,
): SignalState {
  const cycle = signalCycleMs(c)
  let t = (tMs + phase.offsetMs) % cycle
  if (t < 0) t += cycle
  if (t < c.signals.greenMs) return 'green'
  if (t < c.signals.greenMs + c.signals.yellowMs) return 'yellow'
  return 'red'
}

/** Everything the animated systems need, built once. */
export function buildCityPaths(c: CityConfig = cityConfig): CityPaths {
  return {
    vehicleRoutes: buildVehicleRoutes(c),
    pedestrianRoutes: buildPedestrianRoutes(c),
    crossings: buildCrossings(c),
    signals: buildSignals(c),
  }
}
