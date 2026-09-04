import { hashString } from '@/utils/rng'

/**
 * Value noise and the fields built from it.
 *
 * Hand-rolled rather than a dependency: the app ships no npm packages for its
 * procedural work, and this is forty lines of arithmetic.
 *
 * Everything here is a pure function of its coordinates, so the island is
 * reproducible from its seed alone and any point can be asked about without
 * generating its neighbours first.
 */

function hash2D(ix: number, iz: number, seed: number): number {
  let h = ix * 374761393 + iz * 668265263 + seed * 1274126177
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Smoothstep, used as the interpolant so cell boundaries are invisible. */
function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Value noise in [-1, 1]. */
export function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = fade(x - ix)
  const fz = fade(z - iz)

  const a = hash2D(ix, iz, seed)
  const b = hash2D(ix + 1, iz, seed)
  const c = hash2D(ix, iz + 1, seed)
  const d = hash2D(ix + 1, iz + 1, seed)

  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return (top + (bottom - top) * fz) * 2 - 1
}

export interface FbmOptions {
  octaves: number
  lacunarity: number
  gain: number
  frequency: number
}

/** Fractional Brownian motion, roughly [-1, 1]. Rolling ground. */
export function fbm2D(x: number, z: number, seed: number, o: FbmOptions): number {
  let amplitude = 1
  let frequency = o.frequency
  let sum = 0
  let norm = 0
  for (let i = 0; i < o.octaves; i++) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 131) * amplitude
    norm += amplitude
    amplitude *= o.gain
    frequency *= o.lacunarity
  }
  return sum / norm
}

/**
 * Ridged fbm in [0, 1].
 *
 * Each octave is folded about its midline, so the creases that fall out read as
 * ridge lines rather than as rolling hills. This is the difference between a
 * mountain range and a big lumpy field, and no amount of amplitude on plain fbm
 * will produce it.
 */
export function ridged2D(x: number, z: number, seed: number, o: FbmOptions): number {
  let amplitude = 1
  let frequency = o.frequency
  let sum = 0
  let norm = 0
  for (let i = 0; i < o.octaves; i++) {
    const n = valueNoise2D(x * frequency, z * frequency, seed + i * 977)
    sum += (1 - Math.abs(n)) * amplitude
    norm += amplitude
    amplitude *= o.gain
    frequency *= o.lacunarity
  }
  return sum / norm
}

/**
 * Domain warp: displace the query point before anything samples it.
 *
 * This is what stops a noise field reading as noise. Straight features become
 * sinuous, blobs grow peninsulas, and the coastline gets bays that no amount of
 * extra octaves would have produced — because the space itself is bent, not the
 * value read out of it.
 */
export function warp2D(
  x: number,
  z: number,
  seed: number,
  strength: number,
  frequency: number,
): [number, number] {
  return [
    x + valueNoise2D(x * frequency, z * frequency, seed) * strength,
    z + valueNoise2D(x * frequency + 37.7, z * frequency - 11.3, seed + 517) * strength,
  ]
}

/** Seed derivation, so one master seed regenerates the whole island. */
export function seedFor(master: string, facet: string): number {
  return hashString(`${master}:${facet}`)
}
