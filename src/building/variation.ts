import { buildingConfig, type BuildingConfig } from '@/config'

/**
 * Deterministic per-floor variation (plan §14): a hash of the floor's date
 * seeds small, bounded offsets so the tower reads as hand-designed rather
 * than stamped — without ever becoming chaotic. Same date → same variation,
 * every run, every machine.
 */

function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface FloorVariation {
  /** Multiplier for pillar cross-section, 1 ± amplitude. */
  pillarWidthFactor: number
  /** Multiplier for fascia beam height, 1 ± amplitude. */
  fasciaFactor: number
  /** Phase offset for mullion placement along each edge, in [0, 1). */
  mullionPhase: number
  /**
   * Multiplier for concrete tone, 1 ± `concreteShadeAmplitude`. Real precast
   * varies pour to pour, and a tower of identically-toned floors is one of the
   * clearest tells that a facade was generated rather than built.
   */
  concreteShade: number
  /**
   * How brightly this day's glazing reads, in [0, 1). Offices are not equally
   * occupied, and a stack of identical panes reads as one extruded ribbon.
   */
  litFactor: number
}

export function variationFor(date: string, c: BuildingConfig = buildingConfig): FloorVariation {
  const rand = mulberry32(hashString(date))
  const spread = (amp: number) => 1 + (rand() * 2 - 1) * amp
  const amp = c.variationAmplitude
  // Draw order is part of the contract. Every field added here must be
  // appended, never inserted: the sequence a date produces is what makes the
  // tower stable across reloads, and reordering these calls silently reshuffles
  // every existing floor's proportions.
  return {
    pillarWidthFactor: spread(amp),
    fasciaFactor: spread(amp),
    mullionPhase: rand(),
    concreteShade: spread(c.concreteShadeAmplitude),
    litFactor: 1 - rand() * c.glassLitSpread,
  }
}
