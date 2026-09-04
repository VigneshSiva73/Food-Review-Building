import { cityConfig, lightingConfig, uiConfig, type CityDensity } from '@/config'

/**
 * Rendering quality tiers (plan §§31–32): mobile-class devices get a capped
 * device-pixel-ratio, a smaller shadow map, and the mullion layer off by
 * default. Pure `computeQualityTier` is unit-testable; `getQualityTier`
 * reads the live browser state.
 */

export interface QualityTier {
  /** [min, max] device pixel ratio for the canvas. */
  dpr: [number, number]
  shadows: boolean
  shadowMapSize: number
  /** Whether the (dense) mullion layer renders by default. */
  mullions: boolean
  /** City density preset; the environment panel can override it. */
  cityDensity: CityDensity
  /**
   * Cap on simultaneously animated vehicles.
   *
   * Sized to the grid, not picked freely: the streets run to 2400 in each
   * direction now, and the fleet that filled the old district left the outer
   * two thirds of it looking abandoned.
   */
  vehicles: number
  /** Cap on simultaneously animated pedestrians. */
  pedestrians: number
  /**
   * Whether city animation runs by default. Off on mobile-class devices: the
   * animated systems are the only thing that takes the renderer off its
   * on-demand frameloop, so leaving them off keeps a phone idle at zero cost.
   */
  cityAnimation: boolean
  /** Stars in the night sky. One draw call either way; this is fill cost. */
  stars: number
}

export function computeQualityTier(viewportWidth: number, coarsePointer: boolean): QualityTier {
  const mobileLike = coarsePointer || viewportWidth < uiConfig.breakpoints.tablet
  if (mobileLike) {
    return {
      dpr: [1, uiConfig.mobile.dprCap],
      shadows: true,
      shadowMapSize: lightingConfig.shadow.mapSizeMobile,
      mullions: false,
      cityDensity: 'low',
      vehicles: cityConfig.traffic.fleet.mobile,
      pedestrians: 60,
      cityAnimation: false,
      stars: 800,
    }
  }
  return {
    dpr: [1, 2],
    shadows: true,
    shadowMapSize: lightingConfig.shadow.mapSize,
    mullions: true,
    cityDensity: 'high',
    vehicles: cityConfig.traffic.fleet.full,
    pedestrians: 160,
    cityAnimation: true,
    stars: 1500,
  }
}

export function getQualityTier(): QualityTier {
  // matchMedia is absent in some test environments (jsdom).
  const coarse =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  return computeQualityTier(window.innerWidth, coarse)
}
