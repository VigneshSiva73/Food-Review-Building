import { cityConfig, type CityConfig } from '@/config'
import { poseInto, type FlatPose } from './paths'
import { rngFrom } from '@/utils/rng'
import { signalStateAt } from './paths'
import type {
  Route,
  RouteStop,
  SignalPhase,
  SignalState,
  VehicleKind,
  VehicleSpec,
} from './types'

/**
 * Traffic generation and kinematics (plan §18).
 *
 * Pure and Three.js-free: the fleet, the stop lines and the rule that moves a
 * vehicle forward all live here, so the behaviour that is hardest to judge
 * from a screenshot — does a queue actually form, does anyone run a red — is
 * unit-testable without a renderer.
 *
 * Explicitly NOT traffic AI, which the plan rules out. There is no routing, no
 * lane changing and no collision resolution. A vehicle follows one fixed loop
 * forever and obeys exactly two constraints: do not close on the vehicle ahead,
 * and do not enter a junction against a red. That is the minimum needed for a
 * red light to read as a red light rather than as cars piling through it.
 */

/**
 * How a body starts, stops and keeps its distance.
 *
 * Split out of the traffic config because pedestrians run the same rules with
 * very different numbers: a person accelerates gently in absolute terms but
 * reaches walking pace almost at once, and queues at a kerb half a metre apart
 * rather than two and a half.
 */
export interface Kinetics {
  headwayS: number
  accel: number
  decel: number
  /** Gap kept from the body in front when stationary. */
  queueGap: number
}

export const TRAFFIC_KINETICS: Kinetics = Object.freeze({
  headwayS: cityConfig.traffic.headwayS,
  accel: cityConfig.traffic.accel,
  decel: cityConfig.traffic.decel,
  queueGap: cityConfig.traffic.queueGap,
})

export const PEDESTRIAN_KINETICS: Kinetics = Object.freeze({
  headwayS: cityConfig.pedestrians.headwayS,
  accel: cityConfig.pedestrians.accel,
  decel: cityConfig.pedestrians.decel,
  queueGap: cityConfig.pedestrians.queueGap,
})

/** Anything that moves along a route: a vehicle, or a person on foot. */
export interface MovingBody {
  /** Index into the route list. */
  route: number
  /** Arc-length position at rest. */
  offset: number
  cruise: number
  /** Extent along the direction of travel, for the following gap. */
  length: number
}

/** Sizes indexed by kind, so the scene layer and the queueing rule agree. */
export function vehicleSize(kind: VehicleKind, c: CityConfig = cityConfig) {
  return c.traffic.sizes[kind]
}

function kindFor(r: number, c: CityConfig): VehicleKind {
  if (r < c.traffic.busShare) return 'bus'
  if (r < c.traffic.busShare + c.traffic.vanShare) return 'van'
  return 'car'
}

/**
 * Find where a route must wait for each signal.
 *
 * The route is resampled finely rather than read off its own points: a
 * rectangular loop stores vertices only on its corner arcs, so the long
 * straight approach to a junction contains no point to measure from.
 */
export function buildRouteStops(
  route: Route,
  signals: SignalPhase[],
  c: CityConfig = cityConfig,
): RouteStop[] {
  const stopRadius = c.roads.mainHalfWidth + c.roads.crossingDepth + c.traffic.stopMargin
  const step = 1.5
  const n = Math.max(16, Math.ceil(route.length / step))
  const pose: FlatPose = { x: 0, z: 0, heading: 0 }
  const out: RouteStop[] = []

  for (let si = 0; si < signals.length; si++) {
    const centre = signals[si].center
    // Sample the whole loop first: the entry may straddle the start point.
    const inside: boolean[] = new Array(n)
    for (let i = 0; i < n; i++) {
      poseInto(route, (i / n) * route.length, pose)
      inside[i] = Math.hypot(pose.x - centre.x, pose.z - centre.z) < stopRadius
    }
    for (let i = 0; i < n; i++) {
      // The first sample inside the zone whose predecessor was outside it is
      // where the vehicle crosses the stop line.
      if (inside[i] && !inside[(i - 1 + n) % n]) {
        out.push({ distance: (i / n) * route.length, signal: si })
        break
      }
    }
  }
  return out.sort((a, b) => a.distance - b.distance)
}

/** Stop lists for every route, in the same order. */
export function buildAllRouteStops(
  routes: Route[],
  signals: SignalPhase[],
  c: CityConfig = cityConfig,
): RouteStop[][] {
  return routes.map((r) => buildRouteStops(r, signals, c))
}

/**
 * How far a loop reaches from the tower, in block pitches.
 *
 * Read from the route's own geometry rather than from its position in the
 * list, so nothing here depends on the order `buildVehicleRoutes` happens to
 * emit its rings in.
 */
export function ringDistance(route: Route, c: CityConfig = cityConfig): number {
  let extent = 0
  for (const p of route.points) extent = Math.max(extent, Math.abs(p.x), Math.abs(p.z))
  return extent / c.grid.pitch
}

/**
 * Spread a fleet over the routes.
 *
 * Each route's share is weighted by its length and by how close it runs to the
 * tower, then spaced evenly around it with a little jitter. Spacing is floored
 * at the length of the longest vehicle plus its queue gap: packing in more than
 * the road can hold would start the simulation already gridlocked.
 */
export function buildVehicles(
  routes: Route[],
  count: number,
  c: CityConfig = cityConfig,
): VehicleSpec[] {
  if (routes.length === 0 || count <= 0) return []
  const minSpacing = c.traffic.sizes.bus.length + c.traffic.queueGap
  const { ringDensityFalloff, ringDensityFloor } = c.traffic
  const weights = routes.map((r) => {
    const decay = Math.pow(ringDensityFalloff, ringDistance(r, c))
    return r.length * (ringDensityFloor + (1 - ringDensityFloor) * decay)
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  const out: VehicleSpec[] = []
  let assigned = 0

  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri]
    const last = ri === routes.length - 1
    const want = last ? count - assigned : Math.round((weights[ri] / total) * count)
    const share = Math.max(0, Math.min(want, Math.floor(route.length / minSpacing)))
    assigned += share
    const spacing = share > 0 ? route.length / share : 0

    for (let i = 0; i < share; i++) {
      const id = `veh-${ri}-${i}`
      const rng = rngFrom(`${c.seed}:vehicle:${id}`)
      const kind = kindFor(rng.next(), c)
      out.push({
        id,
        route: ri,
        // Jitter is a fraction of the slot, never enough to reorder vehicles:
        // the following rule assumes the queue order it was built with.
        offset: (i + 0.5) * spacing + rng.range(-0.2, 0.2) * spacing,
        cruise: rng.range(c.traffic.speed.min, c.traffic.speed.max),
        kind,
        variant: rng.next(),
      })
    }
  }
  return out
}

/**
 * Forward gap along a closed loop, from `from` to `to`.
 *
 * Always non-negative and always the distance travelling forwards, which is
 * what makes wrapping a non-event: a vehicle just short of the loop's start
 * point still measures a small gap to one just past it.
 */
export function forwardGap(from: number, to: number, length: number): number {
  const d = (to - from) % length
  return d < 0 ? d + length : d
}

/**
 * Speed a driver would hold given the clear distance ahead.
 *
 * A plain time-headway rule: aim to be `headwayS` seconds behind whatever is
 * in front. It yields the whole range of behaviour on its own — full cruise on
 * an empty road, a smooth deceleration onto the back of a queue, and a
 * standstill when the gap closes — without a separate braking model.
 */
export function targetSpeed(cruise: number, clearAhead: number, k: Kinetics): number {
  if (clearAhead <= 0) return 0
  return Math.min(cruise, clearAhead / k.headwayS)
}

/** Move `speed` toward `target` under the acceleration and braking limits. */
export function approachSpeed(speed: number, target: number, dt: number, k: Kinetics): number {
  const limit = (target > speed ? k.accel : k.decel) * dt
  const delta = target - speed
  if (Math.abs(delta) <= limit) return target
  return speed + Math.sign(delta) * limit
}

/** Adapt vehicle specs to the shape the shared stepper works in. */
export function vehicleBodies(specs: VehicleSpec[], c: CityConfig = cityConfig): MovingBody[] {
  return specs.map((spec) => ({
    route: spec.route,
    offset: spec.offset,
    cruise: spec.cruise,
    length: vehicleSize(spec.kind, c).length,
  }))
}

/**
 * Mutable state of the whole fleet, as flat typed arrays.
 *
 * Arrays rather than objects because this is stepped every frame: the pass is
 * a few hundred multiply-adds over contiguous memory and allocates nothing.
 */
export interface FleetState {
  count: number
  /** Arc-length position on the vehicle's route. */
  distance: Float32Array
  speed: Float32Array
  cruise: Float32Array
  routeOf: Int32Array
  /** Half the body length, for turning centre gaps into bumper gaps. */
  halfLength: Float32Array
  /** Cyclic index of the body ahead on the same route, or -1 if alone. */
  ahead: Int32Array
  /** Per-signal scratch: 1 while this fleet may not pass that signal. */
  blocked: Uint8Array
  kinetics: Kinetics
  /**
   * The one signal state in which this fleet may pass a stop line.
   *
   * Traffic goes on green. Walkers go on red — not merely "when traffic is not
   * green", because yellow is the clearance interval when vehicles are still
   * finishing their crossing. Reading the same signal with two different
   * permitted states is the whole of the interlock between the fleets; there
   * is no second signal system to keep in step.
   */
  goOn: SignalState
}

export function createFleetState(
  bodies: MovingBody[],
  signalCount: number,
  options: { kinetics: Kinetics; goOn?: SignalState },
): FleetState {
  const n = bodies.length
  const state: FleetState = {
    count: n,
    distance: new Float32Array(n),
    speed: new Float32Array(n),
    cruise: new Float32Array(n),
    routeOf: new Int32Array(n),
    halfLength: new Float32Array(n),
    ahead: new Int32Array(n).fill(-1),
    blocked: new Uint8Array(signalCount),
    kinetics: options.kinetics,
    goOn: options.goOn ?? 'green',
  }

  for (let i = 0; i < n; i++) {
    const body = bodies[i]
    state.distance[i] = body.offset
    state.speed[i] = body.cruise
    state.cruise[i] = body.cruise
    state.routeOf[i] = body.route
    state.halfLength[i] = body.length / 2
  }

  // Queue order, fixed once. Vehicles never overtake — the following rule
  // forbids it — so "who is in front of me" is a constant array lookup rather
  // than a search every frame.
  const byRoute = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const list = byRoute.get(state.routeOf[i])
    if (list) list.push(i)
    else byRoute.set(state.routeOf[i], [i])
  }
  for (const list of byRoute.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => state.distance[a] - state.distance[b])
    for (let k = 0; k < list.length; k++) state.ahead[list[k]] = list[(k + 1) % list.length]
  }

  return state
}

/**
 * Advance every vehicle by one step.
 *
 * Each driver looks at one number: the clear distance to whatever is in front,
 * be that the back bumper of the vehicle ahead or a stop line held at red.
 * Everything else — queues forming behind a signal, the pull-away when it
 * turns green, buses trailing a longer gap because they are longer — falls out
 * of that single rule rather than being modelled separately.
 */
export function advanceFleet(
  state: FleetState,
  routes: Route[],
  stops: RouteStop[][],
  signals: SignalPhase[],
  elapsedMs: number,
  dt: number,
  c: CityConfig = cityConfig,
): void {
  // Signals change a few times a minute; resolve them once for the fleet.
  for (let s = 0; s < signals.length; s++) {
    state.blocked[s] = signalStateAt(elapsedMs, signals[s], c) === state.goOn ? 0 : 1
  }

  for (let i = 0; i < state.count; i++) {
    const r = state.routeOf[i]
    const len = routes[r].length
    let clear = Infinity

    const j = state.ahead[i]
    if (j >= 0) {
      clear =
        forwardGap(state.distance[i], state.distance[j], len) -
        (state.halfLength[i] + state.halfLength[j] + state.kinetics.queueGap)
    }

    // A red light is just another obstacle in the road. Anything already past
    // the line measures almost a full lap back to it and carries on, which is
    // the behaviour wanted: nobody stops dead inside a junction.
    for (const stop of stops[r]) {
      if (!state.blocked[stop.signal]) continue
      const gap = forwardGap(state.distance[i], stop.distance, len) - state.halfLength[i]
      if (gap < clear) clear = gap
    }

    const k = state.kinetics
    const speed = approachSpeed(state.speed[i], targetSpeed(state.cruise[i], clear, k), dt, k)
    state.speed[i] = speed
    // Clamped to what is actually clear ahead, not merely slowed toward it.
    // Braking alone is a request; a vehicle that starts a step close enough to
    // a red line, or to the car in front, can still cross it inside that step
    // and no deceleration figure prevents that. It showed up as a vehicle
    // crossing a stop line the signal had had ample time to stop it at, and
    // more sharply at coarse frame rates, where the step is longer.
    //
    // Clamping makes the invariant a property of the integrator rather than
    // something the braking curve has to be tuned to achieve.
    const advance = Math.min(speed * dt, Math.max(0, clear))
    let d = state.distance[i] + advance
    if (d >= len) d -= len
    state.distance[i] = d
  }
}
