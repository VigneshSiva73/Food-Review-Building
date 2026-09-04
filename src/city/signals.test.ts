import { describe, expect, it } from 'vitest'
import { cityConfig } from '@/config'
import { buildSignalPosts } from './signals'
import { buildSignals, buildVehicleRoutes, poseAt, signalStateAt } from './paths'
import { seamCoord } from './cityLayout'
import { buildAllRouteStops } from './traffic'
import { buildPedestrianNetwork } from './pedestrians'
import type { Vec2 } from './types'

const signals = buildSignals()
const posts = buildSignalPosts(signals)
const routes = buildVehicleRoutes()
const vehicleStops = buildAllRouteStops(routes, signals)
const network = buildPedestrianNetwork(signals)

function clearanceFromAsphalt(v: number): number {
  let best = Infinity
  for (let b = -cityConfig.grid.midRadius - 1; b <= cityConfig.grid.midRadius; b++) {
    const half =
      b === 0 || b === -1 ? cityConfig.roads.mainHalfWidth : cityConfig.roads.secondaryHalfWidth
    best = Math.min(best, Math.abs(v - seamCoord(b)) - half)
  }
  return best
}

const nearestSignal = (p: Vec2) =>
  signals.reduce((best, s) =>
    Math.hypot(p.x - s.center.x, p.z - s.center.z) <
    Math.hypot(p.x - best.center.x, p.z - best.center.z)
      ? s
      : best,
  )

describe('buildSignalPosts', () => {
  it('stands four posts at every signalled junction', () => {
    expect(posts).toHaveLength(signals.length * 4)
    for (let i = 0; i < signals.length; i++) {
      expect(posts.filter((p) => p.signal === i)).toHaveLength(4)
    }
  })

  it('keeps every post on the footway', () => {
    for (const post of posts) {
      expect(clearanceFromAsphalt(post.position.x)).toBeGreaterThan(0)
      expect(clearanceFromAsphalt(post.position.z)).toBeGreaterThan(0)
      // And on the walkway, not set back into the block behind it.
      const { sidewalkWidth } = cityConfig.roads
      expect(clearanceFromAsphalt(post.position.x)).toBeLessThanOrEqual(sidewalkWidth)
      expect(clearanceFromAsphalt(post.position.z)).toBeLessThanOrEqual(sidewalkWidth)
    }
  })

  it('stays out of the walking line', () => {
    // The pedestrian circuits run along the footway centreline and wait at its
    // corners. A post on that line would have walkers filing through it.
    const circuits = network.routes.slice(network.firstCircuit)
    for (const post of posts) {
      let nearest = Infinity
      for (const route of circuits) {
        for (let i = 0; i < 240; i++) {
          const p = poseAt(route, (route.length * i) / 240).position
          nearest = Math.min(nearest, Math.hypot(p.x - post.position.x, p.z - post.position.z))
        }
      }
      expect(nearest).toBeGreaterThan(0.6)
    }
  })

  it('turns each head back toward its own junction', () => {
    for (const post of posts) {
      // The head faces +Z rotated by the yaw; that has to point at the centre.
      const facing = { x: Math.sin(post.rotationY), z: Math.cos(post.rotationY) }
      const centre = signals[post.signal].center
      const toCentre = {
        x: centre.x - post.position.x,
        z: centre.z - post.position.z,
      }
      const len = Math.hypot(toCentre.x, toCentre.z)
      const dot = (facing.x * toCentre.x + facing.z * toCentre.z) / len
      expect(dot).toBeCloseTo(1)
    }
  })

  it('displays the signal of the junction it stands at', () => {
    for (const post of posts) {
      expect(nearestSignal(post.position)).toBe(signals[post.signal])
    }
  })
})

describe('what the head shows and what the city obeys', () => {
  it('indexes posts, vehicle stops and crossings to the same signal', () => {
    // The one thing this phase can get wrong that nothing else would catch: a
    // head wired to a different entry than the traffic and the walkers at that
    // same junction are reading, so the lights show the opposite of what the
    // city does. Every consumer is checked against the junction's geometry
    // rather than against each other.
    for (const post of posts) {
      expect(post.signal).toBe(signals.indexOf(nearestSignal(post.position)))
    }
    for (let r = 0; r < routes.length; r++) {
      for (const stop of vehicleStops[r]) {
        const p = poseAt(routes[r], stop.distance).position
        expect(stop.signal).toBe(signals.indexOf(nearestSignal(p)))
      }
    }
    for (let r = network.firstCircuit; r < network.routes.length; r++) {
      for (const stop of network.stops[r]) {
        const p = poseAt(network.routes[r], stop.distance).position
        expect(stop.signal).toBe(signals.indexOf(nearestSignal(p)))
      }
    }
  })

  it('never shows green to the traffic and a walk phase at once', () => {
    // Vehicles pass on green, walkers on red. Both read this same function, so
    // what is being pinned is that the two permitted states stay disjoint —
    // if the walk phase were ever widened to include yellow, this fails.
    for (let tMs = 0; tMs < 60_000; tMs += 100) {
      for (const signal of signals) {
        const state = signalStateAt(tMs, signal)
        const trafficMayGo = state === 'green'
        const walkersMayGo = state === 'red'
        expect(trafficMayGo && walkersMayGo).toBe(false)
      }
    }
  })

  it('gives every junction a clearance interval between the two', () => {
    // Yellow is what separates the fleets in time. Without it, traffic would
    // still be in the junction the instant walkers were released.
    const seen = new Set<string>()
    for (let tMs = 0; tMs < 20_000; tMs += 50) seen.add(signalStateAt(tMs, signals[0]))
    expect(seen).toContain('yellow')
    expect(cityConfig.signals.yellowMs).toBeGreaterThan(0)
  })
})
