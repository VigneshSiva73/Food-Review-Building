/**
 * City-environment models emitted by the pure city generators.
 *
 * Deliberately Three.js-free, exactly like `src/types/layout.ts` for the
 * building: the generators stay unit-testable and the scene layer converts to
 * Three.js objects at upload time. Nothing here knows about meshes, materials
 * or the food-review data.
 */

import type { CityRing } from '@/config'

/** A point on the ground plane. World y is always 0 for layout data. */
export interface Vec2 {
  x: number
  z: number
}

/** Integer block coordinates; the hero occupies block (0, 0). */
export interface BlockCoord {
  bx: number
  bz: number
}

/**
 * Where a road sits in the hierarchy.
 *
 * `main` is the pair of avenues flanking the tower's own block. `arterial` is
 * every third seam outward from them, which is what gives the grid a coarse
 * structure to hang districts and commercial frontage on; everything else is a
 * local street. Three widths rather than two, because a city where every road
 * but two is identical reads as graph paper however varied the blocks are.
 */
export type RoadClass = 'main' | 'arterial' | 'secondary'

/** Which world axis a road runs along. */
export type Axis = 'ew' | 'ns'

export interface RoadSegment {
  id: string
  axis: Axis
  /** Constant coordinate of the centreline: z for an 'ew' road, x for 'ns'. */
  center: number
  /** Extent along the running axis, `from` < `to`. */
  from: number
  to: number
  roadClass: RoadClass
  /** Asphalt half-width. */
  halfWidth: number
}

export interface Intersection {
  id: string
  center: Vec2
  /** Asphalt half-extent, the larger of the two crossing roads. */
  halfWidth: number
  /** Plaza-adjacent intersections carry traffic signals. */
  signalled: boolean
}

export interface SidewalkStrip {
  id: string
  axis: Axis
  /** Centreline of the walkway itself, offset from its road. */
  center: number
  from: number
  to: number
  width: number
  /** Which side of its road this walkway is on; the kerb faces `-side`. */
  side: -1 | 1
  /** Centreline of the road it flanks. */
  roadCenter: number
  roadClass: RoadClass
}

/** A buildable parcel inside a block. */
export interface Plot {
  id: string
  block: BlockCoord
  center: Vec2
  halfW: number
  halfD: number
  ring: CityRing
}

/** A named axis-aligned rectangle on the ground. */
export interface GroundRectXZ {
  id: string
  cx: number
  cz: number
  halfW: number
  halfD: number
}

/** An axis-aligned rectangle on the ground, used for the plaza. */
export interface GroundRect {
  center: Vec2
  halfW: number
  halfD: number
}

export interface CityLayout {
  roads: RoadSegment[]
  intersections: Intersection[]
  sidewalks: SidewalkStrip[]
  plots: Plot[]
  /** The hero's own block: paved, never built on. */
  plaza: GroundRect
  /** Radius of the ground disc the whole city sits on. */
  groundRadius: number
}

/**
 * What a block of the grid is for. The zoning field decides one of these for
 * every block, and the builders read it rather than deciding for themselves.
 */
export type Zone =
  | 'core'
  | 'commercial'
  | 'mixed'
  | 'residential'
  | 'suburban'
  | 'park'
  | 'undeveloped'

export type CityBuildingType =
  | 'lowRise'
  | 'midOffice'
  | 'highRise'
  | 'residential'
  | 'glassTower'
  | 'oldUrban'

export type RoofType = 'flat' | 'parapet' | 'stepped' | 'mechanical'

export interface CityBuildingSpec {
  id: string
  position: Vec2
  width: number
  depth: number
  height: number
  floors: number
  type: CityBuildingType
  roof: RoofType
  ring: CityRing
  /** The zoning band this building was generated for. */
  zone: Zone
  /** Radians of yaw; small, so blocks read as built over time. */
  rotationY: number
  /** Stable seeded value in [0, 1) for facade and window variation. */
  variant: number
}

export type PlayKind = 'frame' | 'slide' | 'roundabout'

export interface Playground {
  id: string
  block: BlockCoord
  centre: Vec2
  radius: number
  structures: {
    id: string
    kind: PlayKind
    position: Vec2
    size: number
    rotationY: number
  }[]
  benches: { position: Vec2; rotationY: number }[]
}

export type AttractionKind = 'wheel' | 'tower' | 'carousel' | 'coaster' | 'stall'

export interface Attraction {
  id: string
  kind: AttractionKind
  position: Vec2
  radius: number
  height: number
  rotationY: number
  variant: number
}

/** The theme park: one block, a midway through it, and the rides off it. */
export interface ThemePark {
  block: BlockCoord
  bounds: { cx: number; cz: number; halfW: number; halfD: number }
  /** Where the ticket office stands, on the street. */
  gate: Vec2
  gateRotationY: number
  parking: { cx: number; cz: number; halfW: number; halfD: number }
  /** The midway, as a polyline from the gate inward. */
  path: Vec2[]
  attractions: Attraction[]
}

export type CivicKind = 'hospital' | 'school' | 'shopping' | 'sports' | 'fuel'

/**
 * A public facility occupying a whole block: its building, its hard standing
 * and its grass. The three are emitted separately because they end up in three
 * different buffers — the building with the city's other buildings, the apron
 * with the asphalt, the grass with the parks.
 */
export interface CivicFacility {
  id: string
  kind: CivicKind
  block: BlockCoord
  building: {
    position: Vec2
    width: number
    depth: number
    height: number
    floors: number
    rotationY: number
  } | null
  /** Car parks, drop-offs and courts. */
  aprons: { cx: number; cz: number; halfW: number; halfD: number }[]
  /** Playing fields and landscaping. */
  greens: { cx: number; cz: number; halfW: number; halfD: number }[]
}

export type HouseKind = 'detached' | 'semi' | 'row' | 'villa'

/**
 * One house on a block's perimeter, facing the street it fronts.
 *
 * Kept apart from `CityBuildingSpec` because the two are laid out by different
 * rules — a building fills a plot in the middle of a block, a house stands in
 * a row along its edge — even though both end up merged into the same buffers.
 */
export interface HouseSpec {
  id: string
  /** The block this house stands on the edge of. */
  block: BlockCoord
  position: Vec2
  /** Frontage along the street. */
  width: number
  /** Back from the street. */
  depth: number
  height: number
  floors: number
  /** Yaw putting the front (+Z as modelled) toward the street. */
  rotationY: number
  kind: HouseKind
  variant: number
  /** Ridge rise above the eaves; zero for a flat roof. */
  ridge: number
}

/** A far silhouette mass. Never detailed — fog and distance do the work. */
export interface SkylineMass {
  position: Vec2
  width: number
  depth: number
  height: number
  rotationY: number
}

/**
 * A closed polyline path. `cumulative[i]` is the arc length from `points[0]`
 * to `points[i]`; the final entry equals `length`, the full loop including the
 * closing leg back to the start.
 */
export interface Route {
  id: string
  points: Vec2[]
  cumulative: number[]
  length: number
}

/** Position and facing along a route. `heading` is atan2(dx, dz) radians. */
export interface RoutePose {
  position: Vec2
  heading: number
}

/** Where a pedestrian route steps off the kerb to cross a road. */
export interface Crossing {
  id: string
  center: Vec2
  axis: Axis
  halfWidth: number
  depth: number
}

export type SignalState = 'green' | 'yellow' | 'red'

export interface SignalPhase {
  id: string
  center: Vec2
  /** Milliseconds into the cycle at which this signal's green begins. */
  offsetMs: number
}

export interface CityPaths {
  /** Lane-centred vehicle loops; opposing directions are separate routes. */
  vehicleRoutes: Route[]
  /** Sidewalk loops for pedestrians. */
  pedestrianRoutes: Route[]
  crossings: Crossing[]
  signals: SignalPhase[]
}

/** A planted tree. Trunk and canopy are derived from these by the scene layer. */
export interface TreePlacement {
  id: string
  position: Vec2
  /** Ground height it stands on: walkways sit on the kerb. */
  baseY: number
  /** Overall height, trunk plus canopy. */
  height: number
  canopyRadius: number
  rotationY: number
  /** Seeded value in [0, 1) driving canopy tint and shape jitter. */
  variant: number
  /**
   * Which geometry to draw this one with.
   *
   * Every street in the grid is planted at the same spacing, which is ten
   * thousand trees — three times the whole environment's triangle budget at
   * full detail. `far` trees use a quarter of the triangles, and at the
   * distance they are seen the difference does not survive the first pixel.
   */
  detail: 'near' | 'far'
  /** Species variant: standard street tree or tropical coconut palm. */
  treeKind?: 'standard' | 'coconut'
}

export type PropKind = 'lamp' | 'bench' | 'bin' | 'bollard' | 'busStop'

/** A piece of street furniture, standing upright at a point on the ground. */
export interface PropPlacement {
  id: string
  kind: PropKind
  position: Vec2
  baseY: number
  /** Yaw in radians. Kerb-side props face the road they serve. */
  rotationY: number
}

export interface StreetProps {
  trees: TreePlacement[]
  furniture: PropPlacement[]
}

export type VehicleKind = 'car' | 'van' | 'bus'

/** One vehicle's fixed properties. Its position lives in the animation loop. */
export interface VehicleSpec {
  id: string
  /** Index into the vehicle route list; a vehicle never changes route. */
  route: number
  /** Arc-length position at rest, before any animation has run. */
  offset: number
  /** Cruise speed in units per second. */
  cruise: number
  kind: VehicleKind
  /** Seeded value in [0, 1) driving paint colour. */
  variant: number
}

/** A point on a route where traffic waits for a signal. */
export interface RouteStop {
  /** Arc length at which a waiting vehicle holds. */
  distance: number
  /** Index into the signal list that governs this stop. */
  signal: number
}

/** One walker's fixed properties. Position lives in the animation loop. */
export interface PedestrianSpec {
  id: string
  /** Index into the pedestrian network's route list. */
  route: number
  offset: number
  /** Walking pace in units per second. */
  cruise: number
  /** Seeded value in [0, 1) driving clothing colour and gait phase. */
  variant: number
}

/** Pedestrian routes plus, for the junction circuits, where to wait. */
export interface PedestrianNetwork {
  routes: Route[]
  stops: RouteStop[][]
  /** Index of the first junction circuit in `routes`; earlier ones never cross. */
  firstCircuit: number
}

/** A signal post standing at one corner of a signalled junction. */
export interface SignalPost {
  id: string
  position: Vec2
  baseY: number
  /** Yaw in radians; the head's face (+Z) is turned toward the junction. */
  rotationY: number
  /** Index into the signal list whose state this post displays. */
  signal: number
}
