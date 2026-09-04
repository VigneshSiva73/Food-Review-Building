import { cityConfig, type CityConfig } from '@/config'
import { buildPedestrianRoutes, makeRoute } from './paths'
import { ringDistance, type MovingBody } from './traffic'
import { rngFrom } from '@/utils/rng'
import type {
  PedestrianNetwork,
  PedestrianSpec,
  Route,
  RouteStop,
  SignalPhase,
  Vec2,
} from './types'

/**
 * People on foot (plan §20).
 *
 * Two kinds of route. The block perimeter loops from `buildPedestrianRoutes`
 * stay on the footway for their whole length and never meet a road. The
 * junction circuits built here are the ones that cross: a small square around
 * a signalled junction whose four legs each run along one of that junction's
 * zebras.
 *
 * That shape is not arbitrary. A closed walk on a street grid must cross any
 * given road an even number of times, so the smallest loop that uses crossings
 * at all is one that goes round a junction using all four — which is also
 * exactly what someone circling a junction on foot actually does.
 *
 * Walkers cross on the half of the cycle when the traffic at that junction is
 * being held. The two fleets read the same signal with opposite polarity, so
 * they can never both be in the junction and there is no second signal system
 * to keep in step.
 */

/**
 * A square circuit around one junction, cornered on the four footway corners.
 *
 * Each leg crosses one road along its zebra, and each corner is a place to
 * wait: the corner sits on the kerb, about a metre and a half short of the
 * asphalt, so a held walker stands on the pavement rather than in the road.
 */
function junctionCircuit(
  id: string,
  centre: Vec2,
  signal: number,
  clockwise: boolean,
  c: CityConfig,
): { route: Route; stops: RouteStop[] } {
  const w = c.roads.mainHalfWidth + c.roads.sidewalkWidth / 2
  const corners: Vec2[] = [
    { x: centre.x + w, z: centre.z + w },
    { x: centre.x - w, z: centre.z + w },
    { x: centre.x - w, z: centre.z - w },
    { x: centre.x + w, z: centre.z - w },
  ]
  if (clockwise) corners.reverse()

  const route = makeRoute(id, corners)
  // Sharp corners on purpose: rounding one would cut it across the junction's
  // asphalt, and turning square at a kerb is what a walker does anyway.
  return {
    route,
    stops: route.cumulative.map((distance) => ({ distance, signal })),
  }
}

/**
 * Every route a walker can be on, with the circuits last so a route index
 * above `firstCircuit` is exactly "this one crosses roads".
 */
export function buildPedestrianNetwork(
  signals: SignalPhase[],
  c: CityConfig = cityConfig,
): PedestrianNetwork {
  const perimeter = buildPedestrianRoutes(c)
  const circuits = signals.map((signal, i) =>
    junctionCircuit(`ped-cross-${i}`, signal.center, i, i % 2 === 0, c),
  )

  return {
    routes: [...perimeter, ...circuits.map((x) => x.route)],
    stops: [...perimeter.map(() => [] as RouteStop[]), ...circuits.map((x) => x.stops)],
    firstCircuit: perimeter.length,
  }
}

/**
 * Populate the network.
 *
 * Circuits are filled to a fixed small headcount first — they are short, and
 * every corner of one is gated by the same signal, so a long queue would back
 * up onto the zebra the walker behind is still standing on. Everyone else goes
 * on the perimeter loops, weighted toward the tower the same way traffic is.
 */
export function buildPedestrians(
  network: PedestrianNetwork,
  count: number,
  c: CityConfig = cityConfig,
): PedestrianSpec[] {
  const { routes, firstCircuit } = network
  if (routes.length === 0 || count <= 0) return []

  const perRoute = new Array<number>(routes.length).fill(0)
  let left = count

  for (let r = firstCircuit; r < routes.length && left > 0; r++) {
    const take = Math.min(c.pedestrians.perCircuit, left)
    perRoute[r] = take
    left -= take
  }

  const weights = routes.map((route, r) =>
    r >= firstCircuit
      ? 0
      : route.length * Math.pow(c.traffic.ringDensityFalloff, ringDistance(route, c)),
  )
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total > 0) {
    let assigned = 0
    for (let r = 0; r < firstCircuit; r++) {
      const last = r === firstCircuit - 1
      perRoute[r] = last ? left - assigned : Math.round((weights[r] / total) * left)
      assigned += perRoute[r]
    }
  }

  const out: PedestrianSpec[] = []
  for (let r = 0; r < routes.length; r++) {
    const share = Math.max(0, perRoute[r])
    const spacing = share > 0 ? routes[r].length / share : 0
    for (let i = 0; i < share; i++) {
      const id = `ped-${r}-${i}`
      const rng = rngFrom(`${c.seed}:pedestrian:${id}`)
      out.push({
        id,
        route: r,
        // Jitter stays well inside the slot: the following rule assumes the
        // queue order the fleet was built with.
        offset: (i + 0.5) * spacing + rng.range(-0.25, 0.25) * spacing,
        cruise: rng.range(c.pedestrians.speed.min, c.pedestrians.speed.max),
        variant: rng.next(),
      })
    }
  }
  return out
}

/** Adapt walker specs to the shape the shared stepper works in. */
export function pedestrianBodies(
  specs: PedestrianSpec[],
  c: CityConfig = cityConfig,
): MovingBody[] {
  return specs.map((spec) => ({
    route: spec.route,
    offset: spec.offset,
    cruise: spec.cruise,
    length: c.pedestrians.depth,
  }))
}
