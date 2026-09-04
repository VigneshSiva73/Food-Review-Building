/**
 * Deterministic pseudo-randomness shared by procedural generators.
 *
 * Same seed → same sequence, every run and every machine, which is what keeps
 * the city identical across page refreshes (plan §36).
 *
 * `src/building/variation.ts` carries its own private copy of these two
 * functions. That duplication is deliberate for now: the building layer is
 * frozen while the city is built around it, so it is not being touched. Fold
 * it onto this module when the building layer is next open for edits.
 */

/** djb2 string hash → unsigned 32-bit, for turning stable ids into seeds. */
export function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

/** Small, fast, well-distributed 32-bit PRNG returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded generator with the range helpers the city builders need. */
export interface Rng {
  /** Next value in [0, 1). */
  next: () => number
  /** Uniform float in [min, max). */
  range: (min: number, max: number) => number
  /** Uniform integer in [min, max] inclusive. */
  int: (min: number, max: number) => number
  /** Uniform element of a non-empty list. */
  pick: <T>(items: readonly T[]) => T
  /** True with probability p. */
  chance: (p: number) => boolean
}

/** Build an `Rng` from any stable string key. */
export function rngFrom(key: string): Rng {
  const next = mulberry32(hashString(key))
  const range = (min: number, max: number) => min + next() * (max - min)
  return {
    next,
    range,
    int: (min, max) => Math.floor(range(min, max + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  }
}
