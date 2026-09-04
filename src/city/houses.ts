import { cityConfig, roadReserve, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { seamCoord } from './cityLayout'
import { facilityAt } from './civic'
import { isThemeParkBlock } from './themePark'
import type { BlockCoord, HouseKind, HouseSpec } from './types'
import { zoneAt } from './zoning'

/**
 * Residential neighbourhoods (§§9–10 of the city brief).
 *
 * A suburb is not a low building on a big parcel. The city's plot system puts
 * one or two buildings in the middle of each block, which is right for an
 * apartment or an office and quite wrong for houses: it left a four-storey
 * block alone in the middle of two hundred units of nothing, and a suburb made
 * of those reads as an industrial estate.
 *
 * Houses are laid on the block's PERIMETER instead, facing the streets that
 * bound it, with their gardens backing onto each other in the middle. That is
 * the pattern almost every real suburb is built on, and it is what makes a
 * neighbourhood out of a block: the street has frontage on both sides, the
 * backs are private, and the middle of the block is green without anyone
 * having to design a park there.
 *
 * The block corners are left empty, which is both true to life — a corner plot
 * faces two streets and is usually bigger or a shop — and necessary, since two
 * runs of houses meeting at right angles would otherwise overlap.
 */

/** Which blocks are laid out as houses rather than as plots. */
export function isHouseBlock(block: BlockCoord, c: CityConfig = cityConfig): boolean {
  // A facility owns its whole block: its building, its car park and its
  // grounds. Houses along the edge would stand in the middle of them.
  if (facilityAt(block, c)) return false
  if (isThemeParkBlock(block, c)) return false
  const zone = zoneAt(block, c)
  const rng = rngFrom(`${c.seed}:houseblock:${block.bx}:${block.bz}`)
  // Not EVERY suburban block. A neighbourhood is houses plus the small
  // buildings that serve them — the corner shop, the low apartment block, the
  // parade with flats over it — and a suburb that is nothing but detached
  // houses for two thousand units has no buildings in it at all, which is
  // most of why the city read as having so few.
  if (zone === 'suburban') return rng.chance(c.houses.suburbanShare)
  // Some of the residential ring too, so it reads as houses and apartments
  // mixed rather than as a clean band of one giving way to a band of the other.
  if (zone !== 'residential') return false
  return rng.chance(c.houses.residentialShare)
}

/** Frontage, depth and storeys for each kind of house. */
const KINDS: Readonly<
  Record<
    HouseKind,
    { share: number; width: [number, number]; depth: [number, number]; floors: [number, number] }
  >
> = Object.freeze({
  detached: { share: 0.42, width: [16, 23], depth: [13, 19], floors: [2, 3] },
  semi: { share: 0.2, width: [24, 29], depth: [13, 18], floors: [2, 3] },
  row: { share: 0.23, width: [10, 14], depth: [15, 21], floors: [3, 4] },
  villa: { share: 0.15, width: [23, 29], depth: [19, 25], floors: [3, 4] },
})

function kindFor(roll: number): HouseKind {
  let cumulative = 0
  for (const [kind, spec] of Object.entries(KINDS) as [HouseKind, (typeof KINDS)[HouseKind]][]) {
    cumulative += spec.share
    if (roll <= cumulative) return kind
  }
  return 'detached'
}

/** The four sides of a block, as (fixed edge coordinate, yaw to face the street). */
const SIDES = [
  { axis: 'z' as const, far: false, yaw: Math.PI },
  { axis: 'z' as const, far: true, yaw: 0 },
  { axis: 'x' as const, far: false, yaw: -Math.PI / 2 },
  { axis: 'x' as const, far: true, yaw: Math.PI / 2 },
]

export function buildHouses(c: CityConfig = cityConfig): HouseSpec[] {
  const h = c.houses
  const r = c.grid.midRadius
  const reserve = roadReserve(true, c)
  const out: HouseSpec[] = []

  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      if (!isHouseBlock(block, c)) continue

      const minX = seamCoord(bx - 1, c) + reserve
      const maxX = seamCoord(bx, c) - reserve
      const minZ = seamCoord(bz - 1, c) + reserve
      const maxZ = seamCoord(bz, c) - reserve

      for (const side of SIDES) {
        const alongMin = side.axis === 'z' ? minX : minZ
        const alongMax = side.axis === 'z' ? maxX : maxZ
        const edge = side.axis === 'z' ? (side.far ? maxZ : minZ) : side.far ? maxX : minX
        // Corners left clear: two runs meeting at right angles would overlap,
        // and a corner plot is a different thing in any case.
        const from = alongMin + h.cornerClearance
        const to = alongMax - h.cornerClearance
        const slots = Math.floor((to - from) / h.pitch)
        if (slots < 1) continue

        for (let i = 0; i < slots; i++) {
          // Colon-separated: a block index can be negative, and a hyphen as
          // separator makes `-9` unparseable from the id.
          const id = `house:${bx}:${bz}:${side.axis}${side.far ? '+' : '-'}:${i}`
          const rng = rngFrom(`${c.seed}:${id}`)
          // Not every slot is built on. Gaps are driveways, side returns and
          // the plots nobody ever developed, and they are what stop a street
          // reading as a single extruded terrace.
          if (!rng.chance(h.occupancy)) continue

          const kind = kindFor(rng.next())
          const k = KINDS[kind]
          const width = rng.range(k.width[0], k.width[1])
          const depth = rng.range(k.depth[0], k.depth[1])
          const floors = rng.int(k.floors[0], k.floors[1])
          // Set back from the street by its own front garden, then jittered:
          // a row of houses on one exact building line is the tell of a
          // generated street.
          const setback = h.frontYard + rng.range(0, h.setbackJitter) + depth / 2
          const along = from + h.pitch * (i + 0.5) + rng.range(-h.slotJitter, h.slotJitter)
          const inward = side.far ? -setback : setback
          const position =
            side.axis === 'z' ? { x: along, z: edge + inward } : { x: edge + inward, z: along }

          out.push({
            id,
            block,
            position,
            width,
            depth,
            height: floors * h.storeyHeight,
            floors,
            rotationY: side.yaw + rng.range(-h.yawJitter, h.yawJitter),
            kind,
            variant: rng.next(),
            // A villa is flat-roofed; everything else is gabled, which is most
            // of what tells a house from a small office at this distance.
            ridge: kind === 'villa' ? 0 : rng.range(h.ridge.min, h.ridge.max),
          })
        }
      }
    }
  }
  return out
}
