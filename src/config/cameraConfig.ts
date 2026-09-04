/** Camera + OrbitControls behavior (plan §24). Nothing here is dataset-specific. */

export const cameraConfig = Object.freeze({
  fov: 45,
  near: 0.1,
  /** Far plane scales with fitted distance; this is the floor value. */
  farMin: 500,

  /** Auto-fit: distance = boundingRadius / sin(fov/2) * fitMargin. */
  fitMargin: 1.15,
  /** Camera target sits at this fraction of total building height. */
  targetHeightFraction: 0.55,
  /** Initial elevation angle of the camera above the horizon (degrees). */
  initialElevationDeg: 18,
  initialAzimuthDeg: -30,

  controls: Object.freeze({
    dampingFactor: 0.08,
    minPolarAngleDeg: 5,
    maxPolarAngleDeg: 88,
    /**
     * Closest approach, in scene units (~metres) rather than a fraction of the
     * fitted distance: the fit distance scales with the whole tower, so a
     * proportional floor made it impossible to inspect a single pillar.
     */
    minDistanceUnits: 1.2,
    /** Furthest pull-back, as a multiple of the fitted distance. */
    maxDistanceFactor: 3,
    autoRotateSpeed: 0.6,
  }),

  /**
   * Cinematic travel between selections. The camera swings around the tower on
   * an orbital arc rather than cutting through it, and the move is timed by how
   * far it actually has to go — stepping a floor stays snappy, crossing the
   * building takes its time.
   */
  focus: Object.freeze({
    minDurationMs: 1200,
    maxDurationMs: 3200,
    /** Added milliseconds per scene unit of travel. */
    msPerUnit: 4,
    /** Fraction of extra orbit radius at mid-flight — the pull-back. */
    arcBulge: 0.35,
    /** Module heights to raise the look-at point by at mid-flight — the crane. */
    targetLift: 0.35,
    /** Framing a single pillar: multiples of one module height. */
    pillarDistanceModules: 1.8,
    /** Framing a whole floor or leave band: multiples of the plate radius. */
    plateRadiusFactor: 2.2,
  }),
})

export type CameraConfig = typeof cameraConfig
