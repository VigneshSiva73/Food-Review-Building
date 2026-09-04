import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { sunPositionFromAngles } from '@/scene/timeOfDay/applyBlend'
import { dirFromAngles } from './angles'
import './SkyDome'

/**
 * These also exist to make the module get PARSED.
 *
 * The dome's shaders live in template literals, and a stray backtick in a
 * comment inside one silently ends the literal. That happened, and neither
 * `tsc` nor the test suite caught it — nothing imported the file, so nothing
 * ever read it. Only the dev server's parser complained, and only once a
 * screenshot was taken. Importing it here closes that hole.
 */
describe('dirFromAngles', () => {
  it('agrees with where the light rig actually puts the light', () => {
    // The invariant that matters. The dome draws the sun from these angles and
    // `applyBlend` positions the light from the same ones, through entirely
    // separate arithmetic — if the two ever disagree the scene shows a sun in
    // one place lighting the city from another, which reads as wrong long
    // before anyone works out why.
    const out = new THREE.Vector3()
    for (const [az, el] of [
      [35, 35],
      [-55, 40],
      [120, 14],
      [0, 89],
      [-180, 5],
    ]) {
      const dir = dirFromAngles(az, el, out).clone()
      const [x, y, z] = sunPositionFromAngles(az, el, 80, 400)
      // The rig lifts the light by half the content height so it clears the
      // tower; undo that to recover the pure direction.
      const rig = new THREE.Vector3(x, y - 200, z).normalize()
      expect(dir.x).toBeCloseTo(rig.x, 6)
      expect(dir.y).toBeCloseTo(rig.y, 6)
      expect(dir.z).toBeCloseTo(rig.z, 6)
    }
  })

  it('returns a unit vector, whatever the angles', () => {
    const out = new THREE.Vector3()
    for (const [az, el] of [
      [0, 0],
      [90, -25],
      [-140, 62],
    ]) {
      expect(dirFromAngles(az, el, out).length()).toBeCloseTo(1, 10)
    }
  })

  it('puts a rising sun in the east and a setting one in the west', () => {
    // Azimuth is measured so that +x is east. A sign error here would run the
    // day backwards, which is the kind of thing that looks fine in a still.
    const out = new THREE.Vector3()
    expect(dirFromAngles(105, 6, out).x).toBeGreaterThan(0) // sunrise
    expect(dirFromAngles(-28, 1, out).x).toBeLessThan(0) // sunset
  })

  it('writes into the vector it is given', () => {
    const out = new THREE.Vector3()
    expect(dirFromAngles(35, 35, out)).toBe(out)
  })
})
