import { cityConfig, type CityConfig } from '@/config'
import { fbm2D, seedFor, warp2D } from '@/terrain/noise'
import { rngFrom } from '@/utils/rng'
import { blockCenter, blockRing, seamClass } from './cityLayout'
import type { BlockCoord, Zone } from './types'

/**
 * What each block of the grid is FOR.
 *
 * Everything about the city that is not a road is decided here: what gets
 * built, how tall, how densely, and where the built-up area gives out. Keeping
 * that in one field rather than scattered through the builders is what makes
 * the districts consistent — the buildings, the planting, the traffic and the
 * night lighting all ask the same question and get the same answer.
 *
 * NOT A SET OF RINGS. Two earlier environments were rejected for being
 * generated as circles around the tower, and a zoning that fell off with plain
 * distance would be the same mistake in a new place: a bullseye of districts,
 * visible the moment the camera goes up. The falloff is real — a city does get
 * quieter away from its centre — but it is measured through WARPED
 * coordinates, so the boundary between one district and the next wanders,
 * doubles back, and reaches further out along some streets than others. From
 * above it reads as a city that grew rather than one that was drawn with a
 * compass.
 *
 * The second structural input is the road hierarchy. Commercial frontage
 * follows the arterials rather than a radius, which is why shops appear in
 * ribbons along particular streets instead of in a band at a fixed distance.
 */

/** Distance from the centre, in blocks, measured through warped space. */
export function urbanityAt(block: BlockCoord, c: CityConfig = cityConfig): number {
  const { x, z } = blockCenter(block, c)
  const zone = c.zoning
  const seed = seedFor(c.seed, 'zoning')
  const [wx, wz] = warp2D(x, z, seed, zone.warpStrength, zone.warpFrequency)
  // Chebyshev rather than Euclidean: the city is a grid, and its districts
  // follow streets, so they spread along the axes rather than in a disc.
  const chebyshev = Math.max(Math.abs(wx), Math.abs(wz)) / c.grid.pitch
  // A slow second octave on top, so the edge of a district is ragged at a
  // scale larger than one block — patchy block by block would read as noise.
  const grain = fbm2D(x, z, seed + 91, zone.grain) - 0.5
  return chebyshev + grain * zone.grainBlocks
}

/** True when a block has frontage on a main avenue or an arterial. */
export function onMajorRoad(block: BlockCoord, c: CityConfig = cityConfig): boolean {
  const major = (b: number) => seamClass(b, c) !== 'secondary'
  // A block is bounded by the seams at its own index and the one before it.
  return major(block.bx) || major(block.bx - 1) || major(block.bz) || major(block.bz - 1)
}

/**
 * The zone a block belongs to.
 *
 * Read in order: the tower's own block, then the built-up bands, then the
 * overrides that keep the result from looking like a plan. Commercial promotes
 * a block onto a major road; park and vacancy demote one, and both grow more
 * likely outward — which is how a city thins into its landscape rather than
 * stopping at a line.
 */
export function zoneAt(block: BlockCoord, c: CityConfig = cityConfig): Zone {
  const ring = blockRing(block)
  if (ring === 0) return 'core'
  // The blocks immediately around the plaza are the tower's setting, and they
  // are kept open. Subdividing every block into a proper parcel grid put
  // buildings hard against the landmark on all four sides, which is the one
  // thing §4 says not to do — the composition inverts and the building the
  // whole scene exists for is something you look at past an office block.
  //
  // They become parkland, so everything downstream follows on its own: no
  // plots, no houses, no facility will site itself here, and the grass and
  // trees that dress open ground arrive without another rule.
  if (ring <= c.zoning.clearRings) return 'park'

  const z = c.zoning
  const reach = urbanityAt(block, c)
  const rng = rngFrom(`${c.seed}:zone:${block.bx}:${block.bz}`)

  // How far out this block is, as a fraction of the built city. Used for every
  // probability below, so one number governs the whole gradient.
  const out = Math.min(1, Math.max(0, reach / z.bands.suburban))

  // Open ground, and more of it the further out you go. A city that fills
  // every block it owns is the "building forest" this exists to avoid.
  if (rng.next() < z.parkChance.min + (z.parkChance.max - z.parkChance.min) * out) return 'park'
  if (rng.next() < z.vacantChance.min + (z.vacantChance.max - z.vacantChance.min) * out) {
    return 'undeveloped'
  }

  const base: Zone =
    reach <= z.bands.core
      ? 'core'
      : reach <= z.bands.commercial
        ? 'commercial'
        : reach <= z.bands.mixed
          ? 'mixed'
          : reach <= z.bands.residential
            ? 'residential'
            : 'suburban'

  // Shops follow the big streets. Only outside the core, which is commercial
  // everywhere, and never in the suburbs, where an arterial is a road through
  // rather than a high street.
  if (
    onMajorRoad(block, c) &&
    (base === 'mixed' || base === 'residential') &&
    rng.chance(z.frontageChance)
  ) {
    return 'commercial'
  }

  return base
}
