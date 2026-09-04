import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { buildSignals, poseAt, seamCoord, signalStateAt } from './index'
import { buildPedestrianNetwork, buildPedestrians, pedestrianBodies } from './pedestrians'
import { advanceFleet, createFleetState, forwardGap, PEDESTRIAN_KINETICS } from './traffic'
import type { Vec2 } from './types'

const signals = buildSignals()
const network = buildPedestrianNetwork(signals)
const people = buildPedestrians(network, 160)
const circuits = network.routes.slice(network.firstCircuit)

/** Distance from a coordinate to the nearest asphalt edge; negative when on it. */
function clearanceFromAsphalt(v: number): number {
  let best = Infinity
  for (let b = -cityConfig.grid.midRadius - 1; b <= cityConfig.grid.midRadius; b++) {
    const half =
      b === 0 || b === -1 ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth
    best = Math.min(best, Math.abs(v - seamCoord(b)) - half)
  }
  return best
}

const onAsphalt = (p: Vec2) => clearanceFromAsphalt(p.x) < 0 || clearanceFromAsphalt(p.z) < 0

/** True when a point lies within a marked zebra at a signalled junction. */
function onZebra(p: Vec2): boolean {
  const { mainHalfWidth, crossingDepth } = cityConfig.roads
  const setback = mainHalfWidth + crossingDepth / 2
  for (const s of signals) {
    const dx = Math.abs(p.x - s.center.x)
    const dz = Math.abs(p.z - s.center.z)
    // A crossing of the east–west road: within the zebra's depth in x, and
    // spanning that road's asphalt in z.
    if (Math.abs(dx - setback) <= crossingDepth / 2 && dz <= mainHalfWidth) return true
    if (Math.abs(dz - setback) <= crossingDepth / 2 && dx <= mainHalfWidth) return true
  }
  return false
}

function simulate(seconds: number, dt: number, observe?: (t: number) => void) {
  const state = createFleetState(pedestrianBodies(people), signals.length, {
    kinetics: PEDESTRIAN_KINETICS,
    goOn: 'red',
  })
  let tMs = 0
  for (let step = 0; step < Math.round(seconds / dt); step++) {
    advanceFleet(state, network.routes, network.stops, signals, tMs, dt)
    tMs += dt * 1000
    observe?.(tMs)
  }
  return state
}

describe('buildPedestrianNetwork', () => {
  it('gives one crossing circuit per signalled junction', () => {
    expect(circuits).toHaveLength(signals.length)
    for (let r = 0; r < network.firstCircuit; r++) expect(network.stops[r]).toEqual([])
    for (let r = network.firstCircuit; r < network.routes.length; r++) {
      // One waiting point per corner: every leg of a circuit is a crossing.
      expect(network.stops[r]).toHaveLength(4)
    }
  })

  it('keeps the block loops entirely off the road', () => {
    for (let r = 0; r < network.firstCircuit; r++) {
      const route = network.routes[r]
      for (let i = 0; i < 200; i++) {
        expect(onAsphalt(poseAt(route, (route.length * i) / 200).position)).toBe(false)
      }
    }
  })

  it('crosses only on the zebras', () => {
    // The point of the circuit's shape. Anywhere a walker's path leaves the
    // footway, it must be on a marked crossing.
    for (const route of circuits) {
      for (let i = 0; i < 400; i++) {
        const p = poseAt(route, (route.length * i) / 400).position
        if (onAsphalt(p)) expect(onZebra(p)).toBe(true)
      }
    }
  })

  it('waits on the kerb, not in the road', () => {
    for (let r = network.firstCircuit; r < network.routes.length; r++) {
      for (const stop of network.stops[r]) {
        expect(onAsphalt(poseAt(network.routes[r], stop.distance).position)).toBe(false)
      }
    }
  })

  it('governs each circuit by the junction it goes round', () => {
    for (let r = network.firstCircuit; r < network.routes.length; r++) {
      const route = network.routes[r]
      for (const stop of network.stops[r]) {
        const p = poseAt(route, stop.distance).position
        const own = signals[stop.signal].center
        const nearest = signals.reduce((best, s) =>
          Math.hypot(p.x - s.center.x, p.z - s.center.z) <
          Math.hypot(p.x - best.center.x, p.z - best.center.z)
            ? s
            : best,
        )
        expect(nearest.center).toEqual(own)
      }
    }
  })
})

describe('buildPedestrians', () => {
  it('is deterministic', () => {
    expect(buildPedestrians(network, 160)).toEqual(people)
  })

  it('staffs every crossing circuit, and only lightly', () => {
    for (let r = network.firstCircuit; r < network.routes.length; r++) {
      const n = people.filter((p) => p.route === r).length
      expect(n).toBe(cityConfig.pedestrians.perCircuit)
    }
  })

  it('puts the rest on the block loops, thickest nearest the tower', () => {
    const density = (id: string) => {
      const r = network.routes.findIndex((route) => route.id === id)
      expect(r).toBeGreaterThanOrEqual(0)
      return people.filter((p) => p.route === r).length / network.routes[r].length
    }
    expect(density('ped-block-0-0')).toBeGreaterThan(density('ped-block-2-2'))
  })

  it('walks a circuit of every inner block', () => {
    const r = cityConfig.grid.innerRadius
    expect(network.firstCircuit).toBe((2 * r + 1) ** 2)
  })

  it('allocates the whole headcount', () => {
    expect(people).toHaveLength(160)
  })
})

describe('walking', () => {
  it('never steps onto a crossing while that junction has green', () => {
    // The invariant the phase exists for. Traffic and walkers read the same
    // signal with opposite polarity, so a walker on a zebra while the cars
    // beside them are being waved through is the one thing that must not
    // happen — and it is invisible in a still frame.
    let violations = 0
    const state = createFleetState(pedestrianBodies(people), signals.length, {
      kinetics: PEDESTRIAN_KINETICS,
      goOn: 'red',
    })
    const dt = 1 / 30
    const prev = Float32Array.from(state.distance)
    let tMs = 0

    for (let step = 0; step < Math.round(60 / dt); step++) {
      prev.set(state.distance)
      const stepStartMs = tMs
      advanceFleet(state, network.routes, network.stops, signals, tMs, dt)
      tMs += dt * 1000

      for (let i = 0; i < state.count; i++) {
        const r = state.routeOf[i]
        if (network.stops[r].length === 0) continue
        const len = network.routes[r].length
        const moved = forwardGap(prev[i], state.distance[i], len)
        for (const stop of network.stops[r]) {
          if (signalStateAt(stepStartMs, signals[stop.signal]) !== 'green') continue
          if (forwardGap(prev[i], stop.distance, len) < moved) violations++
        }
      }
    }

    expect(violations).toBe(0)
  })

  it('holds walkers at the kerb and releases them', () => {
    let held = 0
    let walking = 0
    simulate(60, 1 / 30)
    const state = createFleetState(pedestrianBodies(people), signals.length, {
      kinetics: PEDESTRIAN_KINETICS,
      goOn: 'red',
    })
    let tMs = 0
    for (let step = 0; step < Math.round(60 * 30); step++) {
      advanceFleet(state, network.routes, network.stops, signals, tMs, 1 / 30)
      tMs += 1000 / 30
      for (let i = 0; i < state.count; i++) {
        if (state.routeOf[i] < network.firstCircuit) continue
        if (state.speed[i] < 0.05) held++
        else walking++
      }
    }
    // Both states have to occur: never stopping means the signal is ignored,
    // never moving means nobody ever gets a phase.
    expect(held).toBeGreaterThan(0)
    expect(walking).toBeGreaterThan(0)
  })

  it('keeps everyone on their route and moving overall', () => {
    const after = simulate(40, 1 / 30)
    let moved = 0
    for (let i = 0; i < after.count; i++) {
      const len = network.routes[after.routeOf[i]].length
      expect(after.distance[i]).toBeGreaterThanOrEqual(0)
      expect(after.distance[i]).toBeLessThan(len)
      if (after.distance[i] !== people[i].offset) moved++
    }
    expect(moved).toBeGreaterThan(after.count * 0.9)
  })

  it('never lets a walker pass through the person in front', () => {
    let worst = Infinity
    const state = createFleetState(pedestrianBodies(people), signals.length, {
      kinetics: PEDESTRIAN_KINETICS,
      goOn: 'red',
    })
    let tMs = 0
    for (let step = 0; step < Math.round(40 * 30); step++) {
      advanceFleet(state, network.routes, network.stops, signals, tMs, 1 / 30)
      tMs += 1000 / 30
      for (let i = 0; i < state.count; i++) {
        const j = state.ahead[i]
        if (j < 0) continue
        const len = network.routes[state.routeOf[i]].length
        worst = Math.min(
          worst,
          forwardGap(state.distance[i], state.distance[j], len) -
            state.halfLength[i] -
            state.halfLength[j],
        )
      }
    }
    expect(worst).toBeGreaterThan(0)
  })
})
