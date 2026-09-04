import { describe, expect, it } from 'vitest'
import { cameraConfig } from '@/config'
import { computeFit } from './cameraFit'

const DEG = Math.PI / 180

/**
 * The camera must frame any dataset without hardcoded distances (plan §24) —
 * these tests pin that contract for both a 65-floor and a 300-floor tower.
 */
describe('computeFit', () => {
  const small = computeFit(9.6, 511)
  const large = computeFit(9.6, 2360)

  it('places the camera exactly `distance` away from its target', () => {
    for (const fit of [small, large]) {
      const d = Math.hypot(
        fit.position[0] - fit.target[0],
        fit.position[1] - fit.target[1],
        fit.position[2] - fit.target[2],
      )
      expect(d).toBeCloseTo(fit.distance, 6)
    }
  })

  it('aims at the configured fraction of the building height', () => {
    expect(small.target).toEqual([0, 511 * cameraConfig.targetHeightFraction, 0])
    expect(large.target[1]).toBeCloseTo(2360 * cameraConfig.targetHeightFraction)
  })

  it('fits the whole bounding sphere inside the frustum, with margin', () => {
    for (const [radius, height, fit] of [
      [9.6, 511, small],
      [9.6, 2360, large],
    ] as const) {
      const sphereRadius = Math.hypot(height / 2, radius)
      // sin(halfFov) * distance is the frustum radius at that distance.
      const frustumRadius = Math.sin((cameraConfig.fov / 2) * DEG) * fit.distance
      expect(frustumRadius).toBeGreaterThanOrEqual(sphereRadius)
      expect(frustumRadius / sphereRadius).toBeCloseTo(cameraConfig.fitMargin, 5)
    }
  })

  it('scales with the dataset instead of using a fixed distance', () => {
    expect(large.distance).toBeGreaterThan(small.distance * 4)
    // Doubling the content roughly doubles the framing distance.
    const doubled = computeFit(9.6, 1022)
    expect(doubled.distance / small.distance).toBeCloseTo(2, 1)
  })

  it('looks down from above the target at the configured elevation', () => {
    const dy = small.position[1] - small.target[1]
    expect(dy).toBeGreaterThan(0)
    expect(Math.asin(dy / small.distance) / DEG).toBeCloseTo(cameraConfig.initialElevationDeg, 5)
  })

  it('stays finite for a degenerate single-floor building', () => {
    const fit = computeFit(9.6, 7.7)
    expect(Number.isFinite(fit.distance)).toBe(true)
    expect(fit.distance).toBeGreaterThan(0)
  })
})
