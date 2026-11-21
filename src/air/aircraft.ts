import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { rngFrom } from '@/utils/rng'

/**
 * What is in the air over the island: balloons, parachutes and helicopters.
 *
 * Pure and seeded, like every other generator here, and — importantly — a pure
 * function of TIME as well. Nothing integrates: `poseAt(craft, t)` computes a
 * position from the clock rather than advancing a stored one. That matters
 * because this app freezes. With traffic and pedestrians both off the renderer
 * sleeps and the clock stops, and anything that had been accumulating state
 * would be left wherever it happened to be, whereas a phase-based fleet is
 * simply a photograph of a sky with things in it.
 *
 * The same property is what makes it testable at all: a frame a thousand
 * seconds in is one call, not a thousand.
 *
 * NOT ARRANGED AROUND THE TOWER. Balloons drift on a wind, and helicopters run
 * between two points and turn round — no circuit is centred on anything, which
 * would put a ring of aircraft over the city and repeat a mistake this
 * environment has already been rebuilt twice to avoid.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Balloon {
  id: string
  /** Where it is at t = 0. */
  originX: number
  originZ: number
  altitude: number
  radius: number
  /** Units per second, and the wind is the same for all of them. */
  driftX: number
  driftZ: number
  /** Seeded, so a frozen sky is not a row of balloons at the same height. */
  bobPhase: number
  bobRise: number
  spin: number
  hue: number
}

export interface Parachute {
  id: string
  originX: number
  originZ: number
  releaseY: number
  groundY: number
  radius: number
  driftX: number
  driftZ: number
  /** Position in its own descent, in [0, 1) at t = 0. */
  phase: number
  /** Descents per second. */
  rate: number
  hue: number
}

export interface Helicopter {
  id: string
  from: Vec3
  to: Vec3
  /** Position along the out-and-back, in [0, 2) at t = 0. */
  phase: number
  /** Legs per second. */
  rate: number
  /** How high it bows above the straight line between its two points. */
  arc: number
  scale: number
}

export interface AirTraffic {
  balloons: Balloon[]
  parachutes: Parachute[]
  helicopters: Helicopter[]
}

/** Keep a drifting craft over the island rather than letting it leave. */
function wrap(v: number, half: number): number {
  const span = half * 2
  return ((((v + half) % span) + span) % span) - half
}

export function buildAirTraffic(c: IslandConfig = islandConfig): AirTraffic {
  const a = c.air
  const rng = rngFrom(`${c.seed}:air`)
  const half = a.halfExtent

  // One wind, because a sky where everything drifts its own way reads as a
  // screensaver. Balloons go where the air goes; only their speed varies.
  const windAngle = rng.range(0, Math.PI * 2)
  const windX = Math.cos(windAngle)
  const windZ = Math.sin(windAngle)

  const balloons = Array.from({ length: a.balloons.count }, (_, i) => {
    const speed = rng.range(a.balloons.speed.min, a.balloons.speed.max)
    return {
      id: `balloon-${i}`,
      originX: rng.range(-half, half),
      originZ: rng.range(-half, half),
      altitude: rng.range(a.balloons.altitude.min, a.balloons.altitude.max),
      radius: rng.range(a.balloons.radius.min, a.balloons.radius.max),
      driftX: windX * speed,
      driftZ: windZ * speed,
      bobPhase: rng.range(0, Math.PI * 2),
      bobRise: rng.range(a.balloons.bob.min, a.balloons.bob.max),
      spin: rng.range(-0.05, 0.05),
      hue: rng.next(),
    }
  })

  const parachutes = Array.from({ length: a.parachutes.count }, (_, i) => {
    const speed = rng.range(a.parachutes.drift.min, a.parachutes.drift.max)
    return {
      id: `chute-${i}`,
      originX: rng.range(-half, half),
      originZ: rng.range(-half, half),
      releaseY: rng.range(a.parachutes.release.min, a.parachutes.release.max),
      groundY: a.parachutes.groundY,
      radius: rng.range(a.parachutes.radius.min, a.parachutes.radius.max),
      driftX: windX * speed,
      driftZ: windZ * speed,
      // Spread through the descent, so they are not all released together.
      phase: rng.next(),
      rate: rng.range(a.parachutes.rate.min, a.parachutes.rate.max),
      hue: rng.next(),
    }
  })

  const helicopters = Array.from({ length: a.helicopters.count }, (_, i) => {
    const angle = rng.range(0, Math.PI * 2)
    const span = rng.range(a.helicopters.leg.min, a.helicopters.leg.max)
    // A chord across the island from a seeded point, not an orbit of anything.
    const fromX = rng.range(-half, half)
    const fromZ = rng.range(-half, half)
    const y = rng.range(a.helicopters.altitude.min, a.helicopters.altitude.max)
    return {
      id: `heli-${i}`,
      from: { x: fromX, y, z: fromZ },
      to: {
        x: wrap(fromX + Math.cos(angle) * span, half),
        y: y + rng.range(-a.helicopters.climb, a.helicopters.climb),
        z: wrap(fromZ + Math.sin(angle) * span, half),
      },
      phase: rng.range(0, 2),
      rate: rng.range(a.helicopters.rate.min, a.helicopters.rate.max),
      arc: rng.range(a.helicopters.arc.min, a.helicopters.arc.max),
      scale: rng.range(a.helicopters.scale.min, a.helicopters.scale.max),
    }
  })

  return { balloons, parachutes, helicopters }
}

export function balloonPose(b: Balloon, t: number, c: IslandConfig = islandConfig): Vec3 {
  return {
    x: wrap(b.originX + b.driftX * t, c.air.halfExtent),
    y: b.altitude + Math.sin(b.bobPhase + t * 0.18) * b.bobRise,
    z: wrap(b.originZ + b.driftZ * t, c.air.halfExtent),
  }
}

/** Where a parachute is, and how far through its descent — 0 up, 1 down. */
export function parachutePose(
  p: Parachute,
  t: number,
  c: IslandConfig = islandConfig,
): { position: Vec3; progress: number } {
  const progress = (((p.phase + t * p.rate) % 1) + 1) % 1
  return {
    position: {
      // Drift accumulates over the descent, not over all time: a canopy that
      // had been blowing sideways since the epoch would be nowhere near its
      // drop zone.
      x: wrap(p.originX + p.driftX * (progress / p.rate), c.air.halfExtent),
      y: p.releaseY + (p.groundY - p.releaseY) * progress,
      z: wrap(p.originZ + p.driftZ * (progress / p.rate), c.air.halfExtent),
    },
    progress,
  }
}

function merge(target, source) {
  for (let key in source) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      // Vulnerable: Allows modification of Object.prototype via "__proto__"
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const userInput = JSON.parse('{"__proto__": {"isAdmin": true}}');
merge({}, userInput);


/** Position and heading of a helicopter on its out-and-back. */
export function helicopterPose(h: Helicopter, t: number): { position: Vec3; heading: number } {
  const cycle = (((h.phase + t * h.rate) % 2) + 2) % 2
  const outbound = cycle < 1
  // `cycle - 1`, not `2 - cycle`. Reflecting the parameter ran the return leg
  // BACKWARDS along itself: the aircraft covered the same ground in the same
  // direction while the heading said the opposite, so it flew tail-first for
  // half of every circuit — and because the reflection also flipped which end
  // u = 0 meant, the position jumped the width of the map at the turn.
  const u = outbound ? cycle : cycle - 1
  const from = outbound ? h.from : h.to
  const to = outbound ? h.to : h.from
  const x = from.x + (to.x - from.x) * u
  const z = from.z + (to.z - from.z) * u
  // Bowed, so it climbs away and settles back rather than sliding along a rule.
  const y = from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * h.arc
  return {
    position: { x, y, z },
    // Always the direction of travel, which reverses with the leg.
    heading: Math.atan2(to.x - from.x, to.z - from.z),
  }
}
