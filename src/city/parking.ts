import { cityConfig, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { buildCityBuildings } from './cityBuildings'
import type { CityLayout, GroundRectXZ, Zone } from './types'
import { zoneAt } from './zoning'

/**
 * Surface car parks (§19 of the city brief).
 *
 * Every building in the city stands in the middle of a plot it does not fill —
 * the footprint is between a half and nine tenths of the parcel — and that
 * leftover was rendering as bare shelf. Which is nearly right: what is
 * actually beside most buildings is where people leave their cars.
 *
 * So a lot goes in the widest leftover strip of the plot, on the side with the
 * most room. That places it by construction rather than by search: it cannot
 * overlap the building, because it is made from the space the building did not
 * take, and it cannot cross into the street, because the plot was already set
 * back from it.
 *
 * Not everywhere. The brief is explicit that giant empty lots are as wrong as
 * none at all, so the chance falls with density — downtown parks underground
 * and the suburbs park on the drive.
 */

const CHANCE: Readonly<Record<Zone, number>> = Object.freeze({
  core: 0.18,
  commercial: 0.62,
  mixed: 0.5,
  residential: 0.34,
  suburban: 0.2,
  park: 0,
  undeveloped: 0,
})

export interface PlotSurfaces {
  /** Hard standing beside a building. */
  lots: GroundRectXZ[]
  /**
   * Everything else inside the plot.
   *
   * A building fills at most nine tenths of one axis and rather less of the
   * other, so there is always a margin around it, and that margin was bare
   * shelf on every one of two hundred plots — which reads as a building
   * dropped on a car park. Grass is what is actually there, and it is what
   * turns "ROAD, SIDEWALK, LANDSCAPING, BUILDING" from a diagram in the brief
   * into something you can see.
   *
   * Emitted as the four strips around the building rather than as one
   * rectangle under it, because grass sits ABOVE the asphalt layer and a plot
   * covered edge to edge would draw over its own car park.
   */
  greens: GroundRectXZ[]
}

let cache: { surfaces: PlotSurfaces; config: CityConfig } | null = null

/**
 * Memoised: the ground plan, the ground cover and the plot planting all ask
 * for this, and each answer costs a full pass over every building in the city.
 */
export function buildPlotSurfaces(
  layout: CityLayout,
  c: CityConfig = cityConfig,
): PlotSurfaces {
  if (cache?.config === c) return cache.surfaces
  const p = c.parking
  const plots = new Map(layout.plots.map((plot) => [`bld-${plot.id}`, plot]))
  const lots: GroundRectXZ[] = []
  const greens: GroundRectXZ[] = []

  for (const building of buildCityBuildings(layout, 'high', c)) {
    const plot = plots.get(building.id)
    if (!plot) continue
    const rng = rngFrom(`${c.seed}:parking:${building.id}`)

    // The margins the building leaves inside its own plot. It is centred, so
    // each axis leaves the same margin either side.
    //
    // Measured from the YAWED extent, not from width and depth. Buildings
    // carry a few degrees of jitter, and a strip laid to the nominal face runs
    // under the corner that jitter swings out — which is grass drawn inside a
    // building, and one plot in two hundred duly had it.
    const cos = Math.abs(Math.cos(building.rotationY))
    const sin = Math.abs(Math.sin(building.rotationY))
    const halfX = (building.width / 2) * cos + (building.depth / 2) * sin
    const halfZ = (building.width / 2) * sin + (building.depth / 2) * cos
    const marginX = plot.halfW - halfX
    const marginZ = plot.halfD - halfZ
    const alongX = marginX >= marginZ
    const margin = alongX ? marginX : marginZ

    // Which margin, if any, holds a car park.
    let lotSide = 0
    let lotDepth = 0
    if (rng.chance(CHANCE[zoneAt(plot.block, c)]) && margin >= p.minDepth) {
      const depth = Math.min(margin - p.edgeGap - p.buildingGap, p.maxDepth)
      if (depth >= p.minDepth) {
        lotSide = rng.chance(0.5) ? 1 : -1
        lotDepth = depth
        const inner = (alongX ? halfX : halfZ) + p.buildingGap
        const centre = lotSide * (inner + depth / 2)
        const length = (alongX ? plot.halfD : plot.halfW) * 2 * rng.range(0.6, 0.92)
        lots.push({
          id: `park-${building.id}`,
          cx: building.position.x + (alongX ? centre : 0),
          cz: building.position.z + (alongX ? 0 : centre),
          halfW: alongX ? depth / 2 : length / 2,
          halfD: alongX ? length / 2 : depth / 2,
        })
      }
    }

    // Landscaping on the margins the car park did not take. Two strips run the
    // plot's full depth on the wide axis; two more fill the ends between them.
    const pushGreen = (id: string, cx: number, cz: number, halfW: number, halfD: number) => {
      if (halfW <= 0.5 || halfD <= 0.5) return
      greens.push({ id, cx, cz, halfW, halfD })
    }
    for (const side of [-1, 1] as const) {
      const wide = alongX ? marginX : marginZ
      // The car park's side keeps only the sliver behind it, if any.
      const depth = side === lotSide ? wide - lotDepth - p.buildingGap : wide
      const inner = alongX ? halfX : halfZ
      const from = inner + (side === lotSide ? lotDepth + p.buildingGap : 0)
      pushGreen(
        `green-${building.id}-${alongX ? 'x' : 'z'}${side}`,
        building.position.x + (alongX ? side * (from + depth / 2) : 0),
        building.position.z + (alongX ? 0 : side * (from + depth / 2)),
        alongX ? depth / 2 : plot.halfW,
        alongX ? plot.halfD : depth / 2,
      )
    }
    const narrow = alongX ? marginZ : marginX
    for (const side of [-1, 1] as const) {
      const inner = alongX ? halfZ : halfX
      pushGreen(
        `green-${building.id}-${alongX ? 'z' : 'x'}${side}`,
        building.position.x + (alongX ? 0 : side * (inner + narrow / 2)),
        building.position.z + (alongX ? side * (inner + narrow / 2) : 0),
        alongX ? halfX : narrow / 2,
        alongX ? narrow / 2 : halfZ,
      )
    }
  }
  cache = { surfaces: { lots, greens }, config: c }
  return cache.surfaces
}

/** Just the car parks, which is what the road surface wants. */
export function buildParking(layout: CityLayout, c: CityConfig = cityConfig): GroundRectXZ[] {
  return buildPlotSurfaces(layout, c).lots
}
