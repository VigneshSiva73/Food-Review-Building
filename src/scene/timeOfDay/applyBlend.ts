import type { BlendedPreset } from './blendPreset'
import { handles } from './registry'
import { applyHeroTimeOfDay } from '@/scene/resources'
import { applyCityTimeOfDay } from '@/scene/city/cityResources'
import { applyAircraftTimeOfDay } from '@/scene/sky/aircraftResources'

/**
 * Push one hour's lighting onto everything that renders it.
 *
 * The single place the scene's photometrics are written, at rest and in flight
 * alike. Split out from the driver component so it can run without a React
 * tree — the registry's late arrivals call straight into this.
 */

/**
 * Caster placement from its angles, at a distance set only by content size.
 *
 * The radius is angle-independent, so the light rides a constant arc as the
 * hour changes and the shadow camera's near/far planes stay valid throughout.
 * That is what makes a travelling sun cheap: nothing about the frustum needs
 * recomputing, only the direction it looks from.
 */
export function sunPositionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  radius: number,
  height: number,
): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  const dist = Math.max(radius, height) * 2.5
  return [
    Math.cos(el) * Math.sin(az) * dist,
    Math.sin(el) * dist + height * 0.5,
    Math.cos(el) * Math.cos(az) * dist,
  ]
}

/**
 * The environment intensity the hour is currently asking for.
 *
 * The driver writes this onto the ONE scene it owns, and the side panel's
 * floor preview draws the same world in a canvas of its own. Without it the
 * two agree at whatever hour the default happens to suit and disagree at every
 * other, which on nearly-mirrored glazing is the difference between the same
 * glass and a differently-lit one.
 */
let environmentIntensity = 1

export function currentEnvironmentIntensity(): number {
  return environmentIntensity
}

export function applyBlend(blend: BlendedPreset, force = false): void {
  // Module-scoped shared materials, written first and unconditionally: they
  // exist whether or not anything has registered, and the city's may be built
  // long after this driver mounted.
  applyHeroTimeOfDay(blend.hero)
  applyCityTimeOfDay(blend.city)
  // The balloons' burners, on the same channel as the street lamps: both are
  // artificial light that comes on as the daylight goes.
  applyAircraftTimeOfDay(blend.city.lampGlow)

  const lights = handles.lights()
  if (lights) {
    const { hemisphere, caster, fill } = lights
    hemisphere.color.copy(blend.hemisphere.skyColor)
    hemisphere.groundColor.copy(blend.hemisphere.groundColor)
    hemisphere.intensity = blend.hemisphere.intensity

    caster.color.copy(blend.caster.color)
    caster.intensity = blend.caster.intensity
    const [x, y, z] = sunPositionFromAngles(
      blend.caster.azimuthDeg,
      blend.caster.elevationDeg,
      lights.boundingRadius,
      lights.totalHeight,
    )
    caster.position.set(x, y, z)

    fill.color.copy(blend.fill.color)
    fill.intensity = blend.fill.intensity
    // Mirrored across the origin and lowered: the fill exists to keep the
    // shadowed side from going flat, so it has to follow the light it opposes.
    fill.position.set(-x, y * 0.6, -z)
  }

  const scene = handles.scene()
  if (scene) {
    // Fog and background are one colour by contract — a haze that differs from
    // the sky re-lights the distant ground and leaves a visible arc where the
    // ground disc ends. They come from a single field on the keyframe, so this
    // cannot drift.
    if (scene.scene.fog) scene.scene.fog.color.copy(blend.background)
    // The driver installs a Color it owns as the background, so this is always
    // a mutation and never a replacement. Assigning a new Color per frame would
    // churn, and letting React re-declare it would put a second writer on the
    // same slot.
    scene.background.copy(blend.background)
    scene.scene.environmentIntensity = blend.environmentIntensity
  }
  // Recorded whether or not a scene is registered, so a second canvas can
  // match it. See `currentEnvironmentIntensity`.
  environmentIntensity = blend.environmentIntensity

  // The visible sky is uniform writes only, so it runs every frame and stays
  // exactly in step with the light. The reflection probe behind it is a texture
  // rebuild plus a convolution, so it throttles itself and takes `force` on the
  // last frame of a sweep.
  handles.skyDome()?.(blend)
  handles.stars()?.(blend)
  handles.clouds()?.(blend)
  handles.sky()?.(blend, force)
}
