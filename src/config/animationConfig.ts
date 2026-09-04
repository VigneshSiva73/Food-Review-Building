/** Construction-intro animation timeline (plan §29). */

export const animationConfig = Object.freeze({
  /** Delay between successive floor starts (ms); shrinks for large datasets. */
  floorStaggerMs: 90,
  pillarGrowMs: 350,
  slabAppearMs: 250,
  mullionAppearMs: 200,
  /** Hard ceiling on total intro duration; stagger is clamped to fit. */
  maxTotalMs: 10_000,
  /** Easing applied to pillar growth. */
  easing: 'easeOutCubic' as const,
  /** Explode-view transition. */
  explodeMs: 450,
})

export type AnimationConfig = typeof animationConfig
