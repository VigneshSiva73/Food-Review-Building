import { cityConfig, type CityConfig } from '@/config'
import { buildCityLayout } from './cityLayout'
import { rngFrom, type Rng } from '@/utils/rng'
import type {
  CivicKind,
  CityBuildingSpec,
  CityBuildingType,
  CityLayout,
  Plot,
  RoofType,
  SkylineMass,
  Zone,
} from './types'
import { buildFacilities, facilityAt } from './civic'
import { isThemeParkBlock } from './themePark'
import { isHouseBlock } from './houses'
import { zoneAt } from './zoning'

/**
 * Procedural neighbours (plan §§9–10, 18).
 *
 * One reusable generator turns a plot into a building spec. Variation is
 * controlled rather than free: type, height, footprint and roof are all drawn
 * from seeded ranges so the district reads as a coherent piece of city rather
 * than a pile of random boxes — and, critically, so nothing ever approaches
 * the hero's height and steals its landmark status.
 */

/**
 * Type mix per zone.
 *
 * Repeats are the weighting: a residential street is mostly apartment blocks
 * with the odd shop and the odd older building, and listing `residential`
 * twice is a clearer way to say that than a table of probabilities.
 */
const ZONE_TYPES: Readonly<Record<Zone, readonly CityBuildingType[]>> = Object.freeze({
  core: ['glassTower', 'highRise', 'midOffice', 'midOffice', 'oldUrban'],
  commercial: ['midOffice', 'midOffice', 'lowRise', 'oldUrban', 'glassTower'],
  mixed: ['residential', 'midOffice', 'lowRise', 'oldUrban', 'highRise'],
  residential: ['residential', 'residential', 'lowRise', 'oldUrban'],
  suburban: ['lowRise', 'lowRise', 'oldUrban', 'residential'],
  park: [],
  undeveloped: [],
})

/**
 * Storeys per zone.
 *
 * The brief's own ladder is 8–20 floors downtown falling to 1–4 in the
 * suburbs, and the SHAPE of that — each band roughly half the one inside it —
 * is what is kept here. The absolute numbers are multiplied by about three,
 * because the tower has since grown to some three thousand units: at a literal
 * twenty floors the entire city would be a flat plain around it with no
 * downtown to speak of, which fails the brief's other requirement of a gradual
 * transition down from the landmark. Even at 72 the tallest neighbour is a
 * tenth of the tower, so nothing here threatens it.
 */
const ZONE_FLOORS: Readonly<Record<Zone, { min: number; max: number }>> = Object.freeze({
  core: Object.freeze({ min: 24, max: 88 }),
  commercial: Object.freeze({ min: 15, max: 49 }),
  mixed: Object.freeze({ min: 8, max: 27 }),
  residential: Object.freeze({ min: 5, max: 17 }),
  suburban: Object.freeze({ min: 3, max: 9 }),
  park: Object.freeze({ min: 0, max: 0 }),
  undeveloped: Object.freeze({ min: 0, max: 0 }),
})

/**
 * How much of a zone's buildable land is actually built on.
 *
 * The single most important number for the city not reading as a building
 * forest — but it was set too low for a grid with only one or two parcels per
 * block. A quarter of a mixed block coming up empty means the WHOLE block
 * comes up empty about a fifth of the time, because there is nothing else on
 * it, and a district with a fifth of its squares bare does not read as low
 * density, it reads as unfinished.
 *
 * Still a gradient, and still nowhere near one: downtown leaves the odd
 * parcel and the outskirts leave plenty.
 */
const ZONE_COVERAGE: Readonly<Record<Zone, number>> = Object.freeze({
  core: 0.98,
  commercial: 0.93,
  mixed: 0.9,
  residential: 0.88,
  suburban: 0.82,
  park: 0,
  undeveloped: 0,
})

/** Height multipliers keeping each type in its own believable band. */
const TYPE_HEIGHT_SCALE: Readonly<Record<CityBuildingType, number>> = Object.freeze({
  lowRise: 0.3,
  oldUrban: 0.42,
  residential: 0.6,
  midOffice: 0.75,
  glassTower: 0.95,
  highRise: 1,
})

const ROOFS: Readonly<Record<CityBuildingType, RoofType>> = Object.freeze({
  lowRise: 'parapet',
  oldUrban: 'parapet',
  residential: 'flat',
  midOffice: 'mechanical',
  glassTower: 'flat',
  highRise: 'stepped',
})

/**
 * Turn one plot into a building. Exported so a single parcel can be generated
 * and inspected in isolation, which is what the tests do.
 */
export function createCityBuilding(
  plot: Plot,
  c: CityConfig = cityConfig,
): CityBuildingSpec | null {
  // A public facility supplies its own building; the plot system must not put
  // an office block through the middle of a hospital.
  if (facilityAt(plot.block, c)) return null
  if (isThemeParkBlock(plot.block, c)) return null
  const zone = zoneAt(plot.block, c)
  const types = ZONE_TYPES[zone]
  if (types.length === 0) return null
  // A block laid out as houses is built along its edges, not on plots in the
  // middle of it — putting an apartment there too would stand it in the back
  // gardens.
  if (isHouseBlock(plot.block, c)) return null

  const rng = rngFrom(`${c.seed}:building:${plot.id}`)
  // Whether this parcel is built on at all is the first question, and it is
  // asked before anything else is drawn so that the answer does not shift when
  // the type table changes.
  if (rng.next() > ZONE_COVERAGE[zone]) return null

  const type = rng.pick(types)
  const envelope = ZONE_FLOORS[zone]
  const frac = c.buildings.footprintFraction
  // Storeys are drawn across the zone's band, then pulled into the type's own
  // band — so a "lowRise" is short whether it lands downtown or in a suburb.
  const raw = rng.range(envelope.min, envelope.max)
  const floors = Math.max(1, Math.round(envelope.min + (raw - envelope.min) * TYPE_HEIGHT_SCALE[type]))
  const height = floors * c.buildings.storeyHeight

  const width = plot.halfW * 2 * rng.range(frac.min, frac.max)
  const depth = plot.halfD * 2 * rng.range(frac.min, frac.max)
  const maxYaw = (c.buildings.maxRotationDeg * Math.PI) / 180

  return {
    id: `bld-${plot.id}`,
    position: plot.center,
    width,
    depth,
    height,
    floors,
    type,
    roof: ROOFS[type],
    ring: plot.ring,
    zone,
    rotationY: rng.range(-maxYaw, maxYaw),
    variant: rng.next(),
  }
}

/**
 * How a facility's building reads: what it is made of, and what its top does.
 *
 * They go through the same pipeline as everything else rather than getting
 * their own geometry, which is the whole reason they are cheap: a hospital is
 * a mid-rise office as far as the merger is concerned, and it costs no extra
 * material, buffer or draw call.
 */
const CIVIC_STYLE: Readonly<
  Record<CivicKind, { type: CityBuildingType; roof: RoofType } | null>
> = Object.freeze({
  hospital: Object.freeze({ type: 'midOffice' as const, roof: 'mechanical' as const }),
  school: Object.freeze({ type: 'lowRise' as const, roof: 'parapet' as const }),
  shopping: Object.freeze({ type: 'lowRise' as const, roof: 'parapet' as const }),
  sports: null,
  // A kiosk. Masonry rather than office glass, and flat-topped: the canopy
  // over the pumps is a separate thing and stands beside it.
  fuel: Object.freeze({ type: 'lowRise' as const, roof: 'flat' as const }),
})

/** The public facilities, as building specs. */
export function civicBuildings(c: CityConfig = cityConfig): CityBuildingSpec[] {
  const out: CityBuildingSpec[] = []
  for (const f of buildFacilities(c)) {
    const style = CIVIC_STYLE[f.kind]
    if (!style || !f.building) continue
    const rng = rngFrom(`${c.seed}:civicbuild:${f.id}`)
    out.push({
      id: `bld-${f.id}`,
      position: f.building.position,
      width: f.building.width,
      depth: f.building.depth,
      height: f.building.height,
      floors: f.building.floors,
      type: style.type,
      roof: style.roof,
      ring: 'mid',
      zone: zoneAt(f.block, c),
      // Square to its own site: a hospital is not built askew.
      rotationY: f.building.rotationY,
      variant: rng.next(),
    })
  }
  return out
}

/**
 * Generate the city's buildings from the zoning field.
 *
 * Density is no longer a cap on a distance-sorted list. That was right when
 * the district was a couple of hundred units across and every block was much
 * like its neighbour; on a grid this size it would have drawn a hard circle
 * of building around the tower and left the rest of the streets bare, which is
 * the concentric result this city is explicitly not supposed to have.
 *
 * Each parcel now decides for itself, from the zone it stands in. Lowering the
 * quality tier thins the WHOLE city rather than cropping its edge — the same
 * argument the prop spacing makes: a sparser city everywhere reads as a
 * setting, a cropped one reads as a bug.
 */
export function buildCityBuildings(
  layout: CityLayout,
  density: keyof CityConfig['density'] = 'high',
  c: CityConfig = cityConfig,
): CityBuildingSpec[] {
  const keep = c.density[density].buildingCoverage
  const out: CityBuildingSpec[] = []
  for (const plot of layout.plots) {
    const spec = createCityBuilding(plot, c)
    if (!spec) continue
    if (keep < 1 && !rngFrom(`${c.seed}:thin:${plot.id}`).chance(keep)) continue
    out.push(spec)
  }
  return out
}

let builtCache: { set: Set<string>; config: CityConfig } | null = null

/**
 * Which blocks actually ended up with a building on them.
 *
 * Coverage is a probability, so a block in a built zone can quite legitimately
 * produce nothing — and then it rendered as bare shelf, which reads as
 * unfinished rather than as a vacant lot. Everything that dresses open ground
 * asks this so that an unbuilt block gets the same grass and scrub an
 * explicitly undeveloped one does.
 *
 * Memoised because the ground cover, the block planting and the layout all ask
 * it, and the answer costs a whole city layout to compute.
 */
export function builtBlocks(c: CityConfig = cityConfig): Set<string> {
  if (builtCache?.config === c) return builtCache.set
  const set = new Set<string>()
  // Asked of the PLOTS rather than of the finished buildings, because a plot
  // knows its block and a building only knows where it stands.
  for (const plot of buildCityLayout(c).plots) {
    if (createCityBuilding(plot, c)) set.add(`${plot.block.bx}:${plot.block.bz}`)
  }
  builtCache = { set, config: c }
  return set
}

/**
 * The far silhouette: simple masses on an annulus well outside the modelled
 * grid, thinning with distance so the horizon doesn't read as a solid wall.
 */
export function buildSkyline(
  density: keyof CityConfig['density'] = 'high',
  c: CityConfig = cityConfig,
): SkylineMass[] {
  const count = c.density[density].skyline
  const rng: Rng = rngFrom(`${c.seed}:skyline`)
  const { innerRadius, outerRadius, height, width } = c.skyline
  const out: SkylineMass[] = []

  for (let i = 0; i < count; i++) {
    // sqrt keeps the sample area-uniform, so masses don't bunch at the inner
    // edge the way a plain uniform radius would.
    const t = Math.sqrt(rng.next())
    const radius = innerRadius + t * (outerRadius - innerRadius)
    const angle = rng.range(0, Math.PI * 2)
    // Taller masses sit nearer, so the skyline steps down toward the horizon.
    const nearness = 1 - t
    const h = height.min + (height.max - height.min) * (0.35 + 0.65 * nearness) * rng.range(0.5, 1)

    out.push({
      position: { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius },
      width: rng.range(width.min, width.max),
      depth: rng.range(width.min, width.max),
      height: h,
      rotationY: rng.range(0, Math.PI / 2),
    })
  }
  return out
}
