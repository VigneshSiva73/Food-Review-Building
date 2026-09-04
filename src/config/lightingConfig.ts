/** Scene lighting: the parts that do not depend on the hour. */

/**
 * What is left once the hour owns the light.
 *
 * Colours, intensities and the sun's direction used to live here as one fixed
 * setup, with a note explaining that a second scheme meant balancing every
 * surface twice. They now live in `timeOfDayConfig` as a curve over the day —
 * the concern was real, and the answer to it is that there is only ever ONE
 * axis to balance against.
 *
 * What stays is everything a change of hour does not touch: how the shadow map
 * is sampled, and how far the haze reaches. Both are properties of the
 * renderer and the content's size, not of the time of day.
 */
export const lightingConfig = Object.freeze({
  shadow: Object.freeze({
    mapSize: 2048,
    mapSizeMobile: 1024,
    bias: -0.0002,
  }),
  /**
   * Backdrop haze band, expressed relative to building height (multipliers).
   *
   * The colour is not here: fog and background are one value and both belong
   * to the hour, so they come from the keyframe. Only the distances are fixed.
   */
  fog: Object.freeze({
    nearFactor: 1.5,
    farFactor: 6,
  }),
})

export type LightingConfig = typeof lightingConfig
