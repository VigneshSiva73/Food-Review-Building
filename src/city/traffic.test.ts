import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { buildSignals, buildVehicleRoutes, poseAt, signalCycleMs, signalStateAt } from './paths'
import {
  advanceFleet,
  approachSpeed,
  buildAllRouteStops,
  buildVehicles,
  createFleetState,
  forwardGap,
  TRAFFIC_KINETICS,
  targetSpeed,
  vehicleBodies,
} from './traffic'
import type { FleetState } from './traffic'

const routes = buildVehicleRoutes()
const signals = buildSignals()
const stops = buildAllRouteStops(routes, signals)
const vehicles = buildVehicles(routes, cityConfig.traffic.fleet.full)

/** Run the fleet forward, returning the state and a per-step observer's verdict. */
function simulate(seconds: number, dt: number, observe?: (s: FleetState, tMs: number) => void) {
  const state = createFleetState(vehicleBodies(vehicles), signals.length, { kinetics: TRAFFIC_KINETICS })
  let tMs = 0
  for (let step = 0; step < Math.round(seconds / dt); step++) {
    advanceFleet(state, routes, stops, signals, tMs, dt)
    tMs += dt * 1000
    observe?.(state, tMs)
  }
  return state
}

describe('forwardGap', () => {
  it('measures forwards around the loop, so wrapping is a non-event', () => {
    expect(forwardGap(10, 40, 100)).toBe(30)
    // Just behind the start point, looking at something just past it.
    expect(forwardGap(95, 5, 100)).toBe(10)
    expect(forwardGap(40, 10, 100)).toBe(70)
    expect(forwardGap(50, 50, 100)).toBe(0)
  })
})

describe('speed rules', () => {
  it('cruises on a clear road and stops when the gap closes', () => {
    expect(targetSpeed(20, Infinity, TRAFFIC_KINETICS)).toBe(20)
    expect(targetSpeed(20, 0, TRAFFIC_KINETICS)).toBe(0)
    expect(targetSpeed(20, -3, TRAFFIC_KINETICS)).toBe(0)
  })

  it('holds a time headway, so closing on an obstacle slows you smoothly', () => {
    const { headwayS } = cityConfig.traffic
    expect(targetSpeed(20, 9, TRAFFIC_KINETICS)).toBeCloseTo(9 / headwayS)
    // Far enough away that the headway rule is not the binding constraint.
    expect(targetSpeed(20, 200, TRAFFIC_KINETICS)).toBe(20)
  })

  it('respects the acceleration and braking limits', () => {
    const { accel, decel } = cityConfig.traffic
    expect(approachSpeed(0, 20, 0.1, TRAFFIC_KINETICS)).toBeCloseTo(accel * 0.1)
    expect(approachSpeed(20, 0, 0.1, TRAFFIC_KINETICS)).toBeCloseTo(20 - decel * 0.1)
    // Never overshoot the target.
    expect(approachSpeed(0, 0.01, 1, TRAFFIC_KINETICS)).toBe(0.01)
    expect(approachSpeed(5, 5, 1, TRAFFIC_KINETICS)).toBe(5)
  })
})

describe('buildRouteStops', () => {
  it('puts a stop line on every signalled approach and nowhere else', () => {
    // Only the loops flanking the hero block pass the signalled junctions.
    for (const b of [0]) {
      for (const dir of ['out', 'in']) {
        const i = routes.findIndex((r) => r.id === `veh-${b}-${dir}`)
        expect(stops[i]).toHaveLength(signals.length)
      }
    }
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].id.startsWith('veh-0-')) continue
      expect(stops[i]).toHaveLength(0)
    }
  })

  it('holds vehicles outside the junction, not on the crossing', () => {
    // The whole point of the stop line: a vehicle waiting on red must be clear
    // of the zebra, or pedestrians in phase 7 will walk through it.
    const { mainHalfWidth, crossingDepth } = cityConfig.roads
    const zebraOuter = mainHalfWidth + crossingDepth
    for (let i = 0; i < routes.length; i++) {
      for (const stop of stops[i]) {
        const p = poseAt(routes[i], stop.distance).position
        const c = signals[stop.signal].center
        expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThanOrEqual(zebraOuter)
      }
    }
  })

  it('governs each stop by the signal it actually approaches', () => {
    for (let i = 0; i < routes.length; i++) {
      for (const stop of stops[i]) {
        const p = poseAt(routes[i], stop.distance).position
        const own = signals[stop.signal].center
        const nearest = signals.reduce(
          (best, s) =>
            Math.hypot(p.x - s.center.x, p.z - s.center.z) <
            Math.hypot(p.x - best.center.x, p.z - best.center.z)
              ? s
              : best,
          signals[0],
        )
        expect(nearest.center).toEqual(own)
      }
    }
  })
})

describe('buildVehicles', () => {
  it('is deterministic', () => {
    expect(buildVehicles(routes, cityConfig.traffic.fleet.full)).toEqual(vehicles)
  })

  it('puts the traffic where the camera is, not where the tarmac is', () => {
    // Sharing purely by route length loads the long outer rings and leaves the
    // tower's own junctions nearly empty. Density has to fall off outwards.
    const density = (id: string) => {
      const i = routes.findIndex((r) => r.id === id)
      return vehicles.filter((v) => v.route === i).length / routes[i].length
    }
    expect(density('veh-0-out')).toBeGreaterThan(density('veh-2-out') * 2)
    expect(density('veh-2-out')).toBeGreaterThan(density('veh-5-out'))
  })

  it('never starts a route more tightly packed than it can hold', () => {
    const minSpacing = cityConfig.traffic.sizes.bus.length + cityConfig.traffic.queueGap
    for (let r = 0; r < routes.length; r++) {
      const n = vehicles.filter((v) => v.route === r).length
      if (n > 1) expect(routes[r].length / n).toBeGreaterThan(minSpacing)
    }
  })

  it('mixes cars with a few vans and buses', () => {
    const kinds = new Set(vehicles.map((v) => v.kind))
    expect(kinds).toEqual(new Set(['car', 'van', 'bus']))
    expect(vehicles.filter((v) => v.kind === 'car').length).toBeGreaterThan(vehicles.length * 0.6)
  })
})

describe('advanceFleet', () => {
  it('keeps the whole fleet moving over a full signal cycle', () => {
    const before = createFleetState(vehicleBodies(vehicles), signals.length, { kinetics: TRAFFIC_KINETICS })
    const after = simulate(30, 1 / 60)
    let moved = 0
    for (let i = 0; i < after.count; i++) {
      if (Math.abs(after.distance[i] - before.distance[i]) > 1) moved++
    }
    // Some are legitimately held at a red; the great majority must not be.
    expect(moved).toBeGreaterThan(after.count * 0.8)
  })

  it('never lets a vehicle drive into the one in front', () => {
    // The single most visible failure mode: cars sliding through each other
    // as a queue builds. Checked every step, not just at the end.
    let worst = Infinity
    simulate(45, 1 / 60, (s) => {
      for (let i = 0; i < s.count; i++) {
        const j = s.ahead[i]
        if (j < 0) continue
        const len = routes[s.routeOf[i]].length
        const bumper =
          forwardGap(s.distance[i], s.distance[j], len) - s.halfLength[i] - s.halfLength[j]
        worst = Math.min(worst, bumper)
      }
    })
    expect(worst).toBeGreaterThan(0)
  })

  it('never lets a vehicle cross a stop line the signal had time to stop it at', () => {
    // Detects the crossing itself rather than the aftermath. An earlier
    // version looked for stationary vehicles inside the junction, which is the
    // opposite of running a red — with the signal check deleted the fleet
    // sailed straight through and the test still passed.
    //
    // Crossings during the first moments of yellow are legitimate and have to
    // be allowed: a vehicle a tenth of a unit from the line at 14 units/s
    // cannot stop, and no braking model can make it. That is the dilemma zone,
    // and it is what yellow is for. What must never happen is a vehicle
    // crossing once the signal has been showing stop for longer than the
    // fleet's worst-case braking time.
    const { speed, decel } = cityConfig.traffic
    const graceMs = (speed.max / decel) * 1000 * 1.1
    const cycle = signalCycleMs()

    const nonGreenForMs = (tMs: number, offsetMs: number) => {
      const phase = (((tMs + offsetMs) % cycle) + cycle) % cycle
      return phase - cityConfig.signals.greenMs
    }

    const state = createFleetState(vehicleBodies(vehicles), signals.length, { kinetics: TRAFFIC_KINETICS })
    const dt = 1 / 60
    const prev = Float32Array.from(state.distance)
    let violations = 0
    let tMs = 0

    for (let step = 0; step < Math.round(60 / dt); step++) {
      prev.set(state.distance)
      const stepStartMs = tMs
      advanceFleet(state, routes, stops, signals, tMs, dt)
      tMs += dt * 1000

      for (let i = 0; i < state.count; i++) {
        const r = state.routeOf[i]
        if (stops[r].length === 0) continue
        const len = routes[r].length
        const moved = forwardGap(prev[i], state.distance[i], len)
        for (const stop of stops[r]) {
          const showingStopFor = nonGreenForMs(stepStartMs, signals[stop.signal].offsetMs)
          if (showingStopFor < graceMs) continue
          // The stop line lies inside the arc covered this step: it was passed.
          if (forwardGap(prev[i], stop.distance, len) < moved) violations++
        }
      }
    }

    expect(violations).toBe(0)
  })

  it('always holds at least one approach, so the junction never runs free', () => {
    // Adjacent corners are offset half a cycle and green is under half the
    // cycle, so the four signals are never green together. Traffic on the
    // hero's block therefore always has somewhere it has to stop.
    for (let tMs = 0; tMs < 60_000; tMs += 250) {
      expect(signals.every((s) => signalStateAt(tMs, s) === 'green')).toBe(false)
    }
  })

  it('forms a queue at a red', () => {
    // The behaviour the whole phase exists for, and the one a still screenshot
    // can never confirm.
    const state = createFleetState(vehicleBodies(vehicles), signals.length, { kinetics: TRAFFIC_KINETICS })
    const dt = 1 / 60
    let tMs = 0
    let maxStoppedDuringRed = 0

    for (let step = 0; step < Math.round(60 / dt); step++) {
      advanceFleet(state, routes, stops, signals, tMs, dt)
      tMs += dt * 1000
      let stopped = 0
      for (let i = 0; i < state.count; i++) if (state.speed[i] < 0.5) stopped++
      const anyRed = signals.some((s) => signalStateAt(tMs, s) === 'red')
      if (anyRed) maxStoppedDuringRed = Math.max(maxStoppedDuringRed, stopped)
    }

    expect(maxStoppedDuringRed).toBeGreaterThan(2)
  })

  it('never leaves a vehicle standing on a crossing', () => {
    // Blocking the box. Vehicles driving over a zebra on green are fine and
    // expected; one stationary on it is not, and it is the failure a still
    // frame most invites you to misread — two cars mid-zebra look identical
    // whether they are queued there or sailing through.
    const { mainHalfWidth: half, crossingDepth: depth } = cityConfig.roads
    const setback = half + depth / 2
    const onZebra = (p: { x: number; z: number }) =>
      signals.some((s) => {
        const dx = Math.abs(p.x - s.center.x)
        const dz = Math.abs(p.z - s.center.z)
        return (
          (Math.abs(dx - setback) <= depth / 2 && dz <= half) ||
          (Math.abs(dz - setback) <= depth / 2 && dx <= half)
        )
      })

    let stopped = 0
    let crossed = 0
    simulate(60, 1 / 60, (s) => {
      for (let i = 0; i < s.count; i++) {
        if (!onZebra(poseAt(routes[s.routeOf[i]], s.distance[i]).position)) continue
        if (s.speed[i] < 0.5) stopped++
        else crossed++
      }
    })
    expect(stopped).toBe(0)
    // And the crossings do get used, or the assertion above proves nothing.
    expect(crossed).toBeGreaterThan(0)
  })

  it('is frame-rate independent to within a sensible tolerance', () => {
    // The driver clamps its delta, so the same wall-clock span must produce
    // roughly the same result whether frames arrive at 60fps or 20fps.
    const fine = simulate(20, 1 / 60)
    const coarse = simulate(20, 1 / 20)
    let maxDrift = 0
    for (let i = 0; i < fine.count; i++) {
      const len = routes[fine.routeOf[i]].length
      const drift = Math.min(
        forwardGap(fine.distance[i], coarse.distance[i], len),
        forwardGap(coarse.distance[i], fine.distance[i], len),
      )
      maxDrift = Math.max(maxDrift, drift)
    }
    expect(maxDrift).toBeLessThan(12)
  })
})
