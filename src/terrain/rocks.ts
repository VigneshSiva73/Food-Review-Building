import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { rngFrom } from '@/utils/rng'
import { heightAt, type HeightField } from './heightField'
import { slopeAt } from './vegetation'

/**
 * Boulders and outcrops.
 *
 * §29 asks for rocks around mountains, rivers, waterfalls and coasts, and
 * explicitly not evenly distributed. All four of those places have something in
 * common the terrain already knows: they are where soil does not stay. Steep
 * ground sheds it, running water carries it away, and surf strips it — so
 * placement is one score built from slope, flow and distance to the shore, and
 * the four categories fall out of it rather than being handled separately.
 */

export interface Rock {
  x: number
  y: number
  z: number
  radius: number
  rotation: number
  /** Squash, so no two boulders are the same shape. */
  flatten: number
}

function ramp(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function buildRocks(field: HeightField, c: IslandConfig = islandConfig): Rock[] {
  const r = c.rocks
  const rng = rngFrom(`${c.seed}:rocks`)
  const out: Rock[] = []
  const span = field.half * 2
  const cells = Math.ceil(span / r.pitch)

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = -field.half + (i + rng.next()) * r.pitch
      const z = -field.half + (j + rng.next()) * r.pitch

      const ii = Math.min(field.size - 1, Math.max(0, Math.round((x + field.half) / field.step)))
      const jj = Math.min(field.size - 1, Math.max(0, Math.round((z + field.half) / field.step)))
      const cell = jj * field.size + ii
      if (field.shelf[cell] > 0.02) continue

      const h = heightAt(field, x, z)
      if (h <= c.world.seaLevel + 2) continue

      // Bare ground, by any of the three routes that make ground bare.
      const steep = ramp(r.slopeFrom, r.slopeTo, slopeAt(field, x, z))
      const washed = Math.min(1, Math.sqrt(field.flow[cell]) / r.flowScale)
      const surf = 1 - ramp(r.shoreNear, r.shoreFar, field.shoreDistance[cell] * field.step)
      const bare = Math.max(steep, Math.max(washed * 0.85, surf * 0.7))
      if (bare <= r.threshold || rng.next() > bare * r.density) continue

      out.push({
        x,
        y: h,
        z,
        // The barest ground carries the biggest stone.
        radius: r.minRadius + (r.maxRadius - r.minRadius) * bare * rng.range(0.5, 1.3),
        rotation: rng.next() * Math.PI * 2,
        flatten: rng.range(0.45, 0.9),
      })
    }
  }
  return out
}
