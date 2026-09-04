import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { rngFrom } from '@/utils/rng'
import { heightAt, type HeightField } from './heightField'
import { slopeAt } from './vegetation'

/**
 * Where people live outside the city.
 *
 * §18 asks the city to become the island gradually rather than stopping at a
 * line, and §19 and §20 for real communities out there — houses, hamlets,
 * villages on the coast. Both are one problem: find the places a settlement
 * would actually have been founded, and build there.
 *
 * Sites are chosen the way sites are chosen: flat enough to build on, low
 * enough to be worth farming, near fresh water or near the sea, and far enough
 * from each other to be separate places. That is destination-driven rather than
 * a density that fades outward from the tower — a fade would put a ring of
 * suburbs around the city, which is the concentric look this island exists to
 * avoid.
 */

export type SettlementKind = 'suburb' | 'village' | 'coastal'

export interface Settlement {
  x: number
  z: number
  y: number
  kind: SettlementKind
  /** How far the built-up area reaches. */
  radius: number
  /** Street direction, in radians. Everything in the place lines up with it. */
  heading: number
}

export interface Dwelling {
  x: number
  y: number
  z: number
  width: number
  depth: number
  height: number
  rotation: number
  /** 0 house, 1 larger block, 2 outbuilding. */
  form: number
}

function ramp(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function cellOf(field: HeightField, x: number, z: number): number {
  const i = Math.min(field.size - 1, Math.max(0, Math.round((x + field.half) / field.step)))
  const j = Math.min(field.size - 1, Math.max(0, Math.round((z + field.half) / field.step)))
  return j * field.size + i
}

/**
 * How good this ground is to build on, in [0, 1].
 *
 * Slope dominates — you cannot put a street on a hillside — and the rest is
 * about access to water. Nothing in here refers to the tower.
 */
export function buildabilityAt(
  field: HeightField,
  x: number,
  z: number,
  c: IslandConfig = islandConfig,
): number {
  const cell = cellOf(field, x, z)
  // The city's own ground is already built on.
  if (field.shelf[cell] > 0.02) return 0

  const h = heightAt(field, x, z)
  const above = h - c.world.seaLevel
  const s = c.settlements
  // Not in the water, not on the beach itself, and not up on the tops.
  if (above < s.minAbove || h > s.maxAltitude) return 0

  let score = 1 - ramp(s.slopeEasy, s.slopeHard, slopeAt(field, x, z))
  if (score <= 0) return 0

  // Fresh water nearby is worth a great deal, and so is the coast.
  const water = Math.min(1, Math.sqrt(field.flow[cell]) / s.waterScale)
  const coast = 1 - ramp(s.coastNear, s.coastFar, field.shoreDistance[cell] * field.step)
  score *= s.baseline + s.waterBonus * water + s.coastBonus * coast

  return Math.max(0, Math.min(1, score))
}

/**
 * Village sites: good ground, kept apart.
 *
 * Candidates are drawn from a jittered grid and accepted greedily by score with
 * a minimum separation, which is what makes them separate PLACES rather than
 * one smear of building. Sorting by score first means the best ground wins the
 * ties rather than whichever cell happened to be scanned first.
 */
export function buildSettlements(field: HeightField, c: IslandConfig = islandConfig): Settlement[] {
  const s = c.settlements
  const rng = rngFrom(`${c.seed}:settlements`)
  const span = field.half * 2
  const cells = Math.ceil(span / s.candidatePitch)

  const candidates: { x: number; z: number; score: number }[] = []
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = -field.half + (i + rng.next()) * s.candidatePitch
      const z = -field.half + (j + rng.next()) * s.candidatePitch
      const score = buildabilityAt(field, x, z, c)
      if (score > s.minScore) candidates.push({ x, z, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)

  const chosen: Settlement[] = []
  for (const cand of candidates) {
    if (chosen.length >= s.maxPlaces) break
    let tooClose = false
    for (const other of chosen) {
      if (Math.hypot(other.x - cand.x, other.z - cand.z) < s.minSpacing) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    const cell = cellOf(field, cand.x, cand.z)
    // Classified by CONTEXT, not by score. The score saturates — good ground is
    // good ground — so sorting by it made every inland site a suburb and no
    // villages at all. What actually separates a town from a hamlet is what it
    // sits on: the coast, a real river, or ordinary ground.
    const kind: SettlementKind =
      field.shoreDistance[cell] * field.step < s.coastNear
        ? 'coastal'
        : field.flow[cell] >= s.townFlow
          ? 'suburb'
          : 'village'
    chosen.push({
      x: cand.x,
      z: cand.z,
      y: heightAt(field, cand.x, cand.z),
      kind,
      radius: s.radius[kind] * rng.range(0.75, 1.25),
      heading: rng.next() * Math.PI * 2,
    })
  }
  return chosen
}

/**
 * The buildings in each place.
 *
 * Laid on the settlement's own street grid — one heading for the whole place,
 * so a village reads as having been laid out rather than dropped — but with the
 * plots jittered and every building re-checked against the terrain. A plot on a
 * slope, in a river or below the tide line is simply not built on, which is why
 * settlements thin out realistically at their edges instead of ending in a
 * circle.
 */
export function buildDwellings(
  field: HeightField,
  settlements: Settlement[],
  c: IslandConfig = islandConfig,
): Dwelling[] {
  const s = c.settlements
  const rng = rngFrom(`${c.seed}:dwellings`)
  const out: Dwelling[] = []

  for (const place of settlements) {
    const cos = Math.cos(place.heading)
    const sin = Math.sin(place.heading)
    const rows = Math.ceil((place.radius * 2) / s.plotPitch)

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < rows; i++) {
        // Local plot centre, then rotated onto the settlement's own grid.
        const lx = (i - rows / 2 + 0.5) * s.plotPitch + rng.range(-6, 6)
        const lz = (j - rows / 2 + 0.5) * s.plotPitch + rng.range(-6, 6)
        // A street runs down every third row; nothing is built in it.
        if (j % 3 === 2) continue
        if (Math.hypot(lx, lz) > place.radius) continue

        const x = place.x + lx * cos - lz * sin
        const z = place.z + lx * sin + lz * cos

        // Thinning toward the edge, so a place fades out rather than stopping.
        const edge = 1 - Math.hypot(lx, lz) / place.radius
        if (rng.next() > s.density * (0.35 + 0.65 * edge)) continue
        // And the terrain has the final say, always.
        if (buildabilityAt(field, x, z, c) <= s.minPlotScore) continue

        const form = rng.chance(0.12) ? 1 : rng.chance(0.18) ? 2 : 0
        const scale = form === 1 ? rng.range(1.5, 2.3) : form === 2 ? rng.range(0.5, 0.8) : 1
        out.push({
          x,
          y: heightAt(field, x, z),
          z,
          width: s.plotSize * scale * rng.range(0.8, 1.2),
          depth: s.plotSize * scale * rng.range(0.8, 1.2),
          height: s.storeyHeight * (form === 1 ? rng.int(3, 5) : rng.int(1, 2)),
          // Mostly square to the street, with a few askew.
          rotation: place.heading + (rng.chance(0.85) ? 0 : rng.range(-0.5, 0.5)),
          form,
        })
      }
    }
  }
  return out
}
