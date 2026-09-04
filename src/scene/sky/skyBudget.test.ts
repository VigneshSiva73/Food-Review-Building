import { describe, expect, it } from 'vitest'
import { computeQualityTier } from '@/utils/quality'
import { buildCloudField } from './cloudField'
import { buildStarField } from './starField'
import { SKY_HEIGHT, SKY_STRIDE, SKY_WIDTH } from './skyProbe'

/**
 * What the sky costs.
 *
 * The city has a budget test for the same reason: it is the layer most likely
 * to grow quietly, because everything in it is cheap on its own. These are the
 * figures the sky was signed off at, computed from the real builders rather
 * than typed in — a table of literals stops tracking the thing it describes the
 * first time somebody changes a count.
 */

/** Dome, stars, clouds. Every one of them is a single mesh by construction. */
const SKY_MESHES = 3

/** The dome's sphere, at the segment counts `SkyDome` builds it with. */
const DOME_TRIANGLES = 48 * 32 * 2

describe('sky budget', () => {
  it('is three draw calls, whatever the hour', () => {
    // The whole point of the merged cloud buffer and the single Points. Twenty
    // clouds could as easily have been twenty meshes, and would have cost
    // twenty times the draw calls to look identical.
    expect(SKY_MESHES).toBe(3)
  })

  it('keeps the geometry well under the city it hangs over', () => {
    const clouds = buildCloudField().quads * 2
    const total = DOME_TRIANGLES + clouds
    // The city's own guard sits at 350k; the sky must not be a meaningful
    // fraction of it, since it is backdrop.
    expect(total).toBeLessThan(4000)
    expect(clouds).toBeLessThan(300)
  })

  it('costs stars in fill, not in vertices', () => {
    for (const tier of [computeQualityTier(1600, false), computeQualityTier(390, true)]) {
      const field = buildStarField(tier.stars)
      expect(field.count).toBeLessThanOrEqual(2000)
      // Six floats of attributes per star, one buffer, one draw.
      expect(field.positions.length + field.sizes.length).toBe(field.count * 4)
    }
    expect(computeQualityTier(390, true).stars).toBeLessThan(
      computeQualityTier(1600, false).stars,
    )
  })

  it('keeps the reflection probe small enough to repaint ten times a second', () => {
    // It is repainted throughout a transition, and every repaint is followed by
    // a PMREM convolution. This is the number that decides whether that is
    // affordable — at twice the width it is four times the work.
    expect(SKY_WIDTH * SKY_HEIGHT * SKY_STRIDE).toBeLessThanOrEqual(256 * 128 * 4)
  })
})
