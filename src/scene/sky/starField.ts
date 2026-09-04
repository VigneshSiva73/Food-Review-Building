import { rngFrom } from '@/utils/rng'

/**
 * A seeded field of stars on the celestial sphere.
 *
 * Pure data: unit directions plus a few per-star attributes, handed to one
 * `THREE.Points` so the whole sky costs a single draw call. Seeded because the
 * night sky rebuilds whenever the dataset changes, and stars re-rolled per
 * build would swarm rather than sit still.
 *
 * Positions are unit vectors, not world coordinates. The shader pins them to
 * the far plane and re-centres them on the camera, exactly as the dome does, so
 * distance is meaningless here — only direction.
 */

export interface StarField {
  count: number
  /** Unit directions, 3 floats per star. */
  positions: Float32Array
  /** Point size in device pixels, before the pixel-ratio multiply. */
  sizes: Float32Array
  brightness: Float32Array
  /** Twinkle: phase offset, angular frequency, and depth of the dip. */
  phases: Float32Array
  frequencies: Float32Array
  amplitudes: Float32Array
}

/**
 * How far down the sky stars are placed.
 *
 * Just above the horizon rather than down to it. The city fills the bottom of
 * every frame, so stars below this are behind buildings at best — and a star
 * sitting exactly on the horizon line reads as a lamp on a distant roof.
 */
const MIN_HEIGHT = 0.04

/** Share of stars allowed to be noticeably larger than the rest. */
const BRIGHT_SHARE = 0.03

export function buildStarField(count: number): StarField {
  const rng = rngFrom('star-field-01')
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const brightness = new Float32Array(count)
  const phases = new Float32Array(count)
  const frequencies = new Float32Array(count)
  const amplitudes = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // Uniform over the spherical cap: sampling `y` linearly is what makes the
    // density even. Sampling an elevation ANGLE linearly instead would crowd
    // stars around the zenith, which reads as a hole in the sky directly
    // overhead — the giveaway of a generated star field.
    const y = MIN_HEIGHT + (1 - MIN_HEIGHT) * rng.next()
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const azimuth = rng.next() * Math.PI * 2
    positions[i * 3] = Math.cos(azimuth) * radius
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = Math.sin(azimuth) * radius

    // A few bright ones among many faint. A field of uniformly sized dots
    // reads as noise; real skies are mostly faint with a scattering of
    // stand-outs, and it is the stand-outs the eye uses to read it as a sky.
    sizes[i] = rng.chance(BRIGHT_SHARE) ? rng.range(2.6, 3.5) : rng.range(0.8, 2.2)
    // Power law, so most sit near the dim end.
    brightness[i] = 0.25 + 0.75 * Math.pow(rng.next(), 2.5)

    phases[i] = rng.next() * Math.PI * 2
    // Periods of roughly two and a half to eight seconds.
    frequencies[i] = rng.range(0.8, 2.5)
    // Skewed low: a sky where every star pulses hard reads as a fault.
    amplitudes[i] = Math.pow(rng.next(), 2) * 0.35
  }

  return { count, positions, sizes, brightness, phases, frequencies, amplitudes }
}
