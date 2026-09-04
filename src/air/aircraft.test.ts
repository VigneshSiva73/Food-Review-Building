import { describe, expect, it } from 'vitest'
import { islandConfig } from '@/config'
import {
  balloonPose,
  buildAirTraffic,
  helicopterPose,
  parachutePose,
} from './aircraft'

const fleet = buildAirTraffic()
const half = islandConfig.air.halfExtent

describe('buildAirTraffic', () => {
  it('is deterministic', () => {
    expect(buildAirTraffic()).toEqual(fleet)
  })

  it('puts the configured fleet in the air', () => {
    expect(fleet.balloons).toHaveLength(islandConfig.air.balloons.count)
    expect(fleet.parachutes).toHaveLength(islandConfig.air.parachutes.count)
    expect(fleet.helicopters).toHaveLength(islandConfig.air.helicopters.count)
  })

  it('drifts every balloon on ONE wind', () => {
    // A sky where each craft goes its own way reads as a screensaver rather
    // than as weather. Only the speeds differ.
    const angles = fleet.balloons.map((b) => Math.atan2(b.driftZ, b.driftX).toFixed(4))
    expect(new Set(angles).size).toBe(1)
    expect(new Set(fleet.balloons.map((b) => Math.hypot(b.driftX, b.driftZ).toFixed(3))).size)
      .toBeGreaterThan(1)
  })

  it('starts nothing at a phase of zero', () => {
    // The world freezes whenever traffic and pedestrians are off, and the only
    // frame anybody then sees is t = 0. Identical phases would line every
    // parachute up at the same altitude.
    expect(new Set(fleet.parachutes.map((p) => p.phase)).size).toBe(fleet.parachutes.length)
    expect(new Set(fleet.helicopters.map((h) => h.phase)).size).toBe(fleet.helicopters.length)
  })
})

describe('flight paths', () => {
  const times = [0, 1, 37, 600, 5_000, 90_000]

  it('keeps everything over the map, however long it flies', () => {
    for (const t of times) {
      for (const b of fleet.balloons) {
        const p = balloonPose(b, t)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(half + 1e-6)
        expect(Math.abs(p.z)).toBeLessThanOrEqual(half + 1e-6)
      }
      for (const c of fleet.parachutes) {
        const { position } = parachutePose(c, t)
        expect(Math.abs(position.x)).toBeLessThanOrEqual(half + 1e-6)
        expect(Math.abs(position.z)).toBeLessThanOrEqual(half + 1e-6)
      }
      for (const h of fleet.helicopters) {
        const { position } = helicopterPose(h, t)
        expect(Math.abs(position.x)).toBeLessThanOrEqual(half + 1e-6)
        expect(Math.abs(position.z)).toBeLessThanOrEqual(half + 1e-6)
      }
    }
  })

  it('never flies anything into the ground', () => {
    for (const t of times) {
      for (const b of fleet.balloons) expect(balloonPose(b, t).y).toBeGreaterThan(100)
      for (const c of fleet.parachutes) {
        expect(parachutePose(c, t).position.y).toBeGreaterThanOrEqual(c.groundY)
      }
      for (const h of fleet.helicopters) {
        expect(helicopterPose(h, t).position.y).toBeGreaterThan(100)
      }
    }
  })

  it('descends a parachute and starts it again', () => {
    const c = fleet.parachutes[0]
    const cycle = 1 / c.rate
    const top = parachutePose(c, -c.phase * cycle)
    const bottom = parachutePose(c, (1 - c.phase) * cycle - 0.001)
    expect(top.progress).toBeCloseTo(0, 3)
    expect(top.position.y).toBeCloseTo(c.releaseY, 3)
    expect(bottom.position.y).toBeLessThan(c.releaseY * 0.05 + c.groundY)
    // And it is back at the top a moment later, rather than sinking for ever.
    expect(parachutePose(c, (1 - c.phase) * cycle + 0.001).position.y).toBeCloseTo(c.releaseY, 0)
  })

  it('always points a helicopter where it is actually going', () => {
    // The invariant the old test missed. It checked that the two legs'
    // headings differed by 180 degrees, which was true — and useless, because
    // the aircraft was flying the return leg in the same direction as the
    // outbound one while facing the other way. Comparing the heading against
    // the ACTUAL velocity catches that, and catches a reversed model too.
    const wrong: string[] = []
    for (const h of fleet.helicopters) {
      for (let cycle = 0.02; cycle < 2; cycle += 0.05) {
        const t = (cycle - h.phase) / h.rate
        const a = helicopterPose(h, t)
        const b = helicopterPose(h, t + 0.5)
        const travel = Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z)
        const off = Math.abs(((travel - a.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        if (off > 0.01) wrong.push(`${h.id}@${cycle.toFixed(2)}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('flies a continuous path, with no jump at the turn', () => {
    // The reflected parameter also swapped which end of the leg u = 0 meant,
    // so the aircraft crossed the map in a single frame every circuit.
    for (const h of fleet.helicopters) {
      const legLength = Math.hypot(h.to.x - h.from.x, h.to.z - h.from.z)
      let biggest = 0
      let previous = helicopterPose(h, 0).position
      for (let step = 1; step <= 400; step++) {
        const p = helicopterPose(h, (step / h.rate / 200)).position
        biggest = Math.max(biggest, Math.hypot(p.x - previous.x, p.z - previous.z))
        previous = p
      }
      // One step is a two-hundredth of a leg; anything near a whole leg is a
      // teleport rather than a flight.
      expect(`${h.id}:${biggest < legLength * 0.1}`).toBe(`${h.id}:true`)
    }
  })

  it('turns a helicopter round at each end rather than teleporting', () => {
    const h = fleet.helicopters[0]
    // `cycle` is `phase + t * rate` taken mod 2, so the time that puts it at a
    // given point of the out-and-back is (point - phase) / rate.
    const at = (cycle: number) => helicopterPose(h, (cycle - h.phase) / h.rate)
    // Heading on the way out is the reverse of the way back.
    const turn = Math.abs(at(0.25).heading - at(1.25).heading)
    expect(Math.abs(turn - Math.PI)).toBeLessThan(1e-6)
    // And it bows above the straight line between its two points.
    expect(at(0.5).position.y).toBeGreaterThan((h.from.y + h.to.y) / 2)
  })

  it('is a pure function of the clock, so a frozen sky is still a sky', () => {
    // Nothing integrates: the same time always gives the same pose, however it
    // is reached. This is what lets the renderer sleep.
    for (const b of fleet.balloons.slice(0, 5)) {
      expect(balloonPose(b, 1234.5)).toEqual(balloonPose(b, 1234.5))
    }
    const spread = fleet.balloons.map((b) => balloonPose(b, 0).y)
    expect(new Set(spread.map((y) => y.toFixed(2))).size).toBeGreaterThan(fleet.balloons.length / 2)
  })
})
