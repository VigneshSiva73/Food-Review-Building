import { cityConfig, roadReserve, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { seamCoord } from './cityLayout'
import { facilityAt } from './civic'
import { isHouseBlock } from './houses'
import { isThemeParkBlock } from './themePark'
import type { BlockCoord, PlayKind, Playground, Vec2 } from './types'
import { zoneAt } from './zoning'

/**
 * Playgrounds (§17 of the city brief).
 *
 * "Add smaller playgrounds inside residential neighborhoods" — so the test is
 * not whether a block is green, it is whether anybody lives near it. A park on
 * the edge of the commercial strip is a park; the same park with houses on
 * three sides is where the swings go.
 *
 * That is why this looks at a block's NEIGHBOURS rather than at the block. It
 * is the one piece of the city generated from adjacency, and it has to be:
 * "near the houses" is not a property a block has on its own.
 *
 * A playground takes a corner of its park rather than the middle of it, which
 * is both where they usually are — against the street, in sight of the road —
 * and what leaves the rest of the block as the open grass §17 also asks for.
 */

const KINDS: readonly PlayKind[] = ['frame', 'slide', 'roundabout', 'frame', 'slide']

/** How many of the four neighbouring blocks are somebody's street. */
function residentialNeighbours(block: BlockCoord, c: CityConfig): number {
  const around: BlockCoord[] = [
    { bx: block.bx + 1, bz: block.bz },
    { bx: block.bx - 1, bz: block.bz },
    { bx: block.bx, bz: block.bz + 1 },
    { bx: block.bx, bz: block.bz - 1 },
  ]
  return around.filter((b) => {
    if (Math.abs(b.bx) > c.grid.midRadius || Math.abs(b.bz) > c.grid.midRadius) return false
    if (isHouseBlock(b, c)) return true
    const zone = zoneAt(b, c)
    return zone === 'residential' || zone === 'suburban'
  }).length
}

let cache: { list: Playground[]; config: CityConfig } | null = null

/**
 * Every playground in the city.
 *
 * Memoised, and it has to be. This walks the whole grid asking each block's
 * zone and each of its four neighbours' — and the block planting asks for the
 * playgrounds ONCE PER BLOCK, so uncached it was a full grid sweep inside a
 * full grid sweep: over a million zone lookups, each hashing a string and
 * sampling noise. That is what hung the page on load.
 */
export function buildPlaygrounds(c: CityConfig = cityConfig): Playground[] {
  if (cache?.config === c) return cache.list
  const p = c.playgrounds
  const r = c.grid.midRadius
  const reserve = roadReserve(true, c)
  const out: Playground[] = []

  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      if (zoneAt(block, c) !== 'park') continue
      if (facilityAt(block, c) || isThemeParkBlock(block, c)) continue
      if (residentialNeighbours(block, c) < p.minNeighbours) continue

      const minX = seamCoord(bx - 1, c) + reserve + p.inset
      const maxX = seamCoord(bx, c) - reserve - p.inset
      const minZ = seamCoord(bz - 1, c) + reserve + p.inset
      const maxZ = seamCoord(bz, c) - reserve - p.inset
      const radius = p.radius
      if (maxX - minX < radius * 2.4 || maxZ - minZ < radius * 2.4) continue

      const rng = rngFrom(`${c.seed}:playground:${bx}:${bz}`)
      // A corner, not the middle: in sight of the street, and the rest of the
      // block stays open grass.
      const cx = rng.chance(0.5) ? minX + radius : maxX - radius
      const cz = rng.chance(0.5) ? minZ + radius : maxZ - radius
      const centre: Vec2 = { x: cx, z: cz }

      const count = rng.int(p.equipment.min, p.equipment.max)
      const structures = Array.from({ length: count }, (_, i) => {
        const angle = rng.range(0, Math.PI * 2)
        const dist = Math.sqrt(rng.next()) * radius * 0.62
        return {
          id: `play:${bx}:${bz}:${i}`,
          kind: KINDS[Math.floor(rng.next() * KINDS.length) % KINDS.length],
          position: { x: cx + Math.cos(angle) * dist, z: cz + Math.sin(angle) * dist },
          size: rng.range(p.size.min, p.size.max),
          rotationY: rng.range(0, Math.PI * 2),
        }
      })

      out.push({
        id: `playground:${bx}:${bz}`,
        block,
        centre,
        radius,
        structures,
        // Two benches facing in, which is where a parent sits.
        benches: [0, 1].map((i) => {
          const angle = rng.range(0, Math.PI * 2) + i * Math.PI
          return {
            position: {
              x: cx + Math.cos(angle) * radius * 0.86,
              z: cz + Math.sin(angle) * radius * 0.86,
            },
            // Modelled facing +Z; turn it back toward the middle.
            rotationY: Math.atan2(-Math.cos(angle), -Math.sin(angle)) + Math.PI / 2,
          }
        }),
      })
    }
  }
  cache = { list: out, config: c }
  return out
}
