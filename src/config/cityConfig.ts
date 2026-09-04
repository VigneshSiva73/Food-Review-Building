/**
 * City environment constants. Scene units: 1 unit ≈ 1 metre, matching the
 * building. Every city builder reads from here — no magic numbers in the
 * generation code, same rule the building layer follows.
 *
 * The numbers are sized against the hero building rather than chosen freely
 * (plan §29): its footprint is ~65 across and it stands ~935 tall, so the
 * plaza, the block pitch and the neighbour heights are all derived from that
 * to make the tower read as a landmark at a believable scale.
 */

export type CityDensity = 'low' | 'medium' | 'high'

export type CityRing = 'inner' | 'mid'

export const cityConfig = Object.freeze({
  /** Master seed. Changing it regenerates a different but equally stable city. */
  seed: 'food-review-city-01',

  grid: Object.freeze({
    /**
     * Block centre-to-centre spacing. The hero occupies the block at the
     * origin; 180 leaves ~100 of clear plaza from the tower centre to the
     * nearest buildable edge, so the landmark keeps its breathing room.
     */
    pitch: 180,
    /**
     * How many pitches wide the hero's own block is.
     *
     * The plaza is the tower's site, so it is sized to the tower rather than
     * to the grid: at one pitch the building had 79 of clear half-extent to
     * work with, which capped the plan at a 104 side. Two pitches took that to
     * 169; 2.35 takes it to 200, which is what the 264 side needs to keep the
     * same nine-tenths-of-its-block fill every earlier size had.
     *
     * Fractional on purpose. It is a width, not a count of merged blocks —
     * rounding it to 2 or 3 would either crowd the tower or leave it standing
     * in a car park.
     *
     * It works as a plain wider block rather than as several blocks merged
     * because seams accumulate OUTWARD from this one — widening it pushes the
     * whole grid out and no street ever needs deleting. Nothing else in the
     * city measures from the origin, so nothing else has to know.
     */
    plazaBlocks: 2.35,
    /**
     * How far a block's width may stray from the pitch.
     *
     * A grid of one pitch everywhere is a sheet of graph paper. Real grids are
     * regular in DIRECTION and irregular in spacing — the avenues stay parallel
     * while the blocks between them differ in depth — so each seam index takes a
     * seeded multiple of the pitch.
     */
    spanBands: Object.freeze([
      Object.freeze({ share: 0.3, min: 0.72, max: 0.88 }),
      Object.freeze({ share: 0.34, min: 0.92, max: 1.18 }),
      Object.freeze({ share: 0.26, min: 1.5, max: 1.85 }),
      Object.freeze({ share: 0.1, min: 2.15, max: 2.6 }),
    ]),
    /** The narrowest a block can be, which is what plot sizing has to survive. */
    spanMin: 0.72,
    /** Chebyshev block radius of the detailed inner ring (excludes centre). */
    innerRadius: 2,
    /**
     * Chebyshev block radius where the mid ring ends.
     *
     * Set so the outermost seam lands at ~2400, which is the full width of the
     * island's flat shelf: the streets reach every part of the plain, and the
     * terrain roads coming in from the villages meet the grid at its edge
     * rather than stopping short of it across open brown ground.
     */
    midRadius: 9,
  }),

  roads: Object.freeze({
    /** Asphalt half-width of the two avenues flanking the plaza. */
    mainHalfWidth: 8,
    /** Asphalt half-width of an arterial: the grid's coarse structure. */
    arterialHalfWidth: 6.5,
    /** Asphalt half-width of every other street. */
    secondaryHalfWidth: 5,
    /**
     * Every nth seam out from the plaza is an arterial.
     *
     * Counted outward from the tower's own two seams in both directions, so
     * the pattern is symmetric about the plaza rather than about the origin of
     * the block index — which is not the same thing, since the index runs
     * 0, 1, 2 one way and -2, -3, -4 the other.
     */
    arterialEvery: 3,
    /** Walkway each side of the asphalt. */
    sidewalkWidth: 3,
    /** Kerb upstand between sidewalk and asphalt. */
    curbHeight: 0.15,
    /** Lane centre offset from the road centreline (one lane each way). */
    laneOffset: 3.2,
    /** Painted line width for centre lines, lane dashes and stop bars. */
    markingWidth: 0.25,
    /** Zebra crossing depth, measured along the direction of travel. */
    crossingDepth: 4,
  }),

  // The hero's own block is the plaza and is never built on. Its clear
  // half-extent is derived in `cityLayout.blockHalfExtent` from the pitch and
  // the road reserve, so widening a road can never silently eat into it.

  /**
   * The zoning field: how the city thins from its core outward.
   *
   * Distances are in BLOCKS from the tower, measured through warped space, so
   * these are the shape of the gradient rather than literal radii.
   *
   * They run to 13.6 rather than to `midRadius`, which is 9. A block index is
   * not a distance: block widths are seeded and average well over a pitch, so
   * the ninth block out sits about thirteen pitches from the tower. Sized to
   * the index instead, every band past the core landed outside the city and
   * the whole grid came out suburban.
   */
  zoning: Object.freeze({
    /**
     * How far the coordinates are pushed before distance is measured, and at
     * what scale. Strength is in world units and deliberately larger than a
     * block: anything smaller only frays the boundary, where the point is to
     * move whole districts off the circle they would otherwise sit on.
     */
    warpStrength: 520,
    warpFrequency: 0.00042,
    /** A slower second octave, so district edges are ragged at district scale. */
    grain: Object.freeze({ octaves: 3, frequency: 0.0011, gain: 0.5, lacunarity: 2 }),
    /** How many blocks of wander that grain is worth. */
    grainBlocks: 1.6,
    /** Outer edge of each band, in warped blocks from the tower. */
    bands: Object.freeze({
      core: 2.6,
      commercial: 4.6,
      mixed: 7,
      residential: 9.8,
      suburban: 13.6,
    }),
    /**
     * Chance a block is green space; rises with distance from the centre.
     *
     * Between them these two were reserving a third of the city — sixty-one
     * park blocks and sixty-two vacant ones out of three hundred and sixty —
     * which is more open ground than a city has and read as an unfinished
     * district rather than as one that breathes. Halved. The gradient is
     * unchanged: both still grow more likely outward, so the built-up area
     * still gives out into the landscape rather than stopping at a line.
     */
    parkChance: Object.freeze({ min: 0.03, max: 0.11 }),
    /** Chance a block is simply not built on yet. Also rises outward. */
    vacantChance: Object.freeze({ min: 0.02, max: 0.1 }),
    /** Chance a mixed or residential block on a major road turns commercial. */
    frontageChance: 0.55,
    /**
     * Rings of blocks around the plaza kept clear of building.
     *
     * The tower's forecourt. One ring is eight blocks, which at these spans is
     * a green setting three hundred units deep on every side.
     */
    clearRings: 1,
  }),

  buildings: Object.freeze({
    /**
     * Setback of a plot's buildable area from its block edge.
     *
     * Cut from 10 with the gap below, to widen the buildings without taking
     * any away: the parcel grid is untouched, so the count is untouched, and
     * every building simply uses more of the ground it already had.
     */
    plotSetback: 6,
    /**
     * Target parcel frontage, per ring. A block is subdivided into a grid of
     * roughly this size rather than into a count, so a big block yields many
     * parcels and a small one a few — which is what a real block does.
     *
     * Widened with the storeys. This, not `footprintFraction`, is the lever
     * that actually makes a building wider: the block is divided by the target
     * frontage, so giving each parcel more ground back only bought more
     * parcels of the same size until the target itself moved.
     */
    parcelInner: 98,
    parcelMid: 118,
    /** Gap between neighbouring parcels on the same block. */
    plotGap: 3,
    /**
     * Storey height. Heights are now derived FROM a storey count rather than
     * the other way round — a building has whole floors — and the count comes
     * from the zoning band in `cityBuildings`, not from a per-ring envelope.
     *
     * Raised from 4.2 along with the storey bands in `cityBuildings`: beside a
     * 935-unit tower the city was reading as a model village, with a median
     * building 46 units tall.
     */
    storeyHeight: 4.8,
    /**
     * Plan-dimension envelope, as a fraction of the buildable plot. Raised
     * from 0.55–0.92 so a building fills its parcel rather than sitting in the
     * middle of it.
     */
    footprintFraction: Object.freeze({ min: 0.68, max: 0.98 }),
    /** Maximum yaw jitter so blocks read as built over time, not stamped. */
    maxRotationDeg: 4,

    /**
     * Roof forms. `RoofType` has been on the spec since the city was first
     * built and the geometry ignored it — every roof was one flat quad, which
     * is why a block of six buildings read as six boxes however much their
     * heights and tints differed. The top of a building is most of what you
     * see of it from a camera that looks down.
     */
    roof: Object.freeze({
      /** Upstand around a flat deck, in world units. */
      parapetHeight: 1.2,
      /** A stepped top's setback, as a fraction of the plan half-extent. */
      stepInset: 0.24,
      stepStoreys: Object.freeze({ min: 2, max: 5 }),
      /** Plant room on an office roof, as a fraction of the plan. */
      plantFraction: 0.36,
      plantStoreys: Object.freeze({ min: 1, max: 2 }),
    }),

    /**
     * Tower-on-podium massing.
     *
     * The one piece of shape variety that is not a roof: a wide base of two to
     * four storeys filling its parcel with a narrower tower rising out of it.
     * It is what most tall commercial buildings actually do — the podium is
     * the shops and the lobby — and it breaks up a downtown that would
     * otherwise be a field of plain extrusions.
     */
    podium: Object.freeze({
      /** Only tall buildings get one; below this a podium reads as a mistake. */
      minFloors: 16,
      storeys: Object.freeze({ min: 2, max: 4 }),
      /** How far the tower steps in from the podium's edge. */
      towerInset: 0.22,
      chance: 0.6,
    }),
  }),

  /**
   * Facades are mapped in world units, not in normalised box UVs: a window is
   * the same size on a squat shop and on a tower, which is what stops the
   * neighbours reading as stretched boxes.
   */
  facade: Object.freeze({
    /**
     * Share of windows lit after dark.
     *
     * A quarter, not most. Lighting every pane reads as a showroom rather than
     * as a building people work in, and a lit window only registers as lit
     * because the ones around it are not.
     */
    litFraction: 0.26,
    /**
     * Horizontal spacing of one window bay.
     *
     * Widened with the buildings themselves. The blocks grew by half to stand
     * up against the Food Building, and a bay that did not grow with them put
     * half again as many windows on every elevation — which at district scale
     * stopped reading as windows at all and started reading as a fine speckle.
     */
    paneWidth: 5.2,
    /**
     * Windows across and floors up in one texture tile.
     *
     * The tile is what repeats across a wall, so this is the period of the
     * lit-window pattern, and at four it was short enough to see: every
     * elevation showed the same four-by-four arrangement over and over, which
     * is most of why the district read as one texture rather than as a
     * thousand buildings. Doubling it costs one texture upload and buys a
     * pattern long enough that the eye stops finding the repeat.
     */
    tileCols: 8,
    tileRows: 8,
    /** Canvas resolution per tile — held at 64px a bay. */
    textureSize: 512,
  }),

  /**
   * Street planting and furniture (plan §16).
   *
   * Spacings are in world units along a walkway, so raising one thins that
   * prop everywhere at once. The placement rule is deliberately simple and
   * statable: every street gets trees and lamps, only the avenues get things
   * to sit on or throw rubbish in, and nothing stands inside a junction.
   */
  props: Object.freeze({
    /** Distance between street trees along one walkway. */
    treeSpacing: 34,
    /** Lamp posts are half as frequent as trees and sit between them. */
    lampSpacing: 68,
    /**
     * How much wider the LAMP spacing gets outside the detailed inner ring.
     *
     * Trees have no such scale: every street in the grid is planted at
     * `treeSpacing`, because a thinner outer planting is exactly what read as
     * "some roads have no trees". They stay affordable by dropping to cheaper
     * geometry with distance instead — see `TreePlacement.detail`.
     *
     * A lamp cannot do the same. It is a column, an arm and a head rather than
     * a blob on a stick, so there is no cheap version of it, and it only earns
     * its keep after dark. Distance thins the lamps and detail thins the
     * trees; between them the whole grid fits the triangle budget.
     */
    outerLampScale: 8,
    /** Benches and bins, avenues only. */
    benchSpacing: 100,
    binSpacing: 150,
    /**
     * Clearance kept around a junction's asphalt. Anything closer would stand
     * in a crossing or block the sightline a driver needs at the corner.
     */
    junctionClearance: 7,
    /** Offset from the walkway centreline. Kerb side is toward the road. */
    kerbOffset: 0.95,
    tree: Object.freeze({
      height: Object.freeze({ min: 7, max: 11.5 }),
      canopyRadius: Object.freeze({ min: 1.9, max: 2.9 }),
      /**
       * Share of the total height that is bare trunk. Kept high enough that a
       * street tree reads as a tree rather than a lollipop: at 0.42 the canopy
       * swallowed the trunk and the crowns overhung most of the footway.
       */
      trunkFraction: 0.48,
    }),
    lampHeight: 7.5,
    /** Bollards ring the plaza, marking it as the tower's pedestrian forecourt. */
    bollardSpacing: 12,
    bollardHeight: 0.95,
    /** Shelters on the avenue walkways, half a block either side of the plaza. */
    busStops: 2,
    /** Walkway kept clear around a shelter, so nothing grows through it. */
    shelterClearance: 6,
  }),

  /**
   * Suburban houses, laid along the perimeter of a block rather than on plots
   * in the middle of it. See `city/houses.ts` for why.
   */
  houses: Object.freeze({
    /** Share of residential blocks laid out as houses instead of apartments. */
    residentialShare: 0.45,
    /**
     * Share of SUBURBAN blocks laid out as houses.
     *
     * The rest get buildings — the corner shop, the low apartment block, the
     * parade with flats over it. Every suburban block being houses meant the
     * outer two thirds of the city had no buildings on it whatever, which is
     * most of why there seemed to be so few.
     */
    suburbanShare: 0.42,
    /**
     * Centre-to-centre spacing of the plots along a street. Widened with the
     * houses themselves, or the bigger frontages would overlap their
     * neighbours.
     */
    pitch: 30,
    /** Fraction of plots actually built on; the rest are drives and gaps. */
    occupancy: 0.82,
    /** Kept clear at each end of a run, so two sides never overlap. */
    cornerClearance: 30,
    /** Front garden between the footway and the building line. */
    frontYard: 7,
    setbackJitter: 4,
    slotJitter: 2.5,
    yawJitter: 0.05,
    /** Raised from 3.2 with the storey counts, for the same reason as above. */
    storeyHeight: 3.8,
    ridge: Object.freeze({ min: 2.6, max: 4.4 }),
  }),

  /**
   * Playgrounds in the parks that have houses round them. See
   * `city/playgrounds.ts` — the test is adjacency, not zoning.
   */
  playgrounds: Object.freeze({
    /** How many of the four neighbours must be somebody's street. */
    minNeighbours: 2,
    inset: 8,
    radius: 22,
    equipment: Object.freeze({ min: 3, max: 5 }),
    size: Object.freeze({ min: 3.2, max: 5.4 }),
  }),

  /** Surface car parks beside buildings. See `city/parking.ts`. */
  parking: Object.freeze({
    /** A lot shallower than this is a loading bay, not a car park. */
    minDepth: 9,
    maxDepth: 26,
    /** Kerb between the lot and the plot boundary. */
    edgeGap: 2,
    /** Footway between the lot and the building it serves. */
    buildingGap: 3,
  }),

  /**
   * The theme park. See `city/themePark.ts` — one block, a midway, and the
   * rides hung off it.
   */
  themePark: Object.freeze({
    /** Out where there is room, in warped blocks from the tower. */
    minReach: 5.5,
    /** The narrowest site worth using. */
    minSpan: 190,
    inset: 6,
    /** Where the gate sits along the midway, 0 being the street end. */
    gateAt: 0.06,
    firstStop: 0.22,
    lastStop: 0.94,
    /** How far a ride stands off the midway, as a fraction of the site width. */
    offset: Object.freeze({ min: 0.14, max: 0.3 }),
    /** Wander of a ride's position along the path. */
    jitter: 0.035,
    /** How much the midway itself meanders, as a fraction of the site width. */
    meander: 0.1,
    pathSteps: 14,
    /** Width of the midway's paving. */
    pathWidth: 9,
    /** The car park by the gate, as fractions of the site. */
    parking: Object.freeze({ alongHalf: 0.1, acrossHalf: 0.16, offset: 0.28 }),
    sizes: Object.freeze({
      wheel: Object.freeze({
        radius: Object.freeze({ min: 15, max: 22 }),
        height: Object.freeze({ min: 34, max: 48 }),
      }),
      tower: Object.freeze({
        radius: Object.freeze({ min: 3.5, max: 5 }),
        height: Object.freeze({ min: 45, max: 66 }),
      }),
      carousel: Object.freeze({
        radius: Object.freeze({ min: 9, max: 13 }),
        height: Object.freeze({ min: 8, max: 11 }),
      }),
      coaster: Object.freeze({
        radius: Object.freeze({ min: 22, max: 34 }),
        height: Object.freeze({ min: 16, max: 26 }),
      }),
      stall: Object.freeze({
        radius: Object.freeze({ min: 3.5, max: 6 }),
        height: Object.freeze({ min: 3.4, max: 4.6 }),
      }),
    }),
  }),

  /**
   * Public facilities. See `city/civic.ts` — these are chosen rather than
   * generated, which is why they have counts and spacings instead of chances.
   */
  civic: Object.freeze({
    kinds: Object.freeze({
      /**
       * One hospital. Six to nine storeys, a large car park, and grounds — and
       * on an arterial, which the scoring enforces rather than the layout.
       */
      hospital: Object.freeze({
        count: 1,
        spacing: 1500,
        buildingShare: 0.5,
        apronShare: 0.32,
        greenShare: 0.18,
        footprint: 0.86,
        floors: Object.freeze({ min: 6, max: 9 }),
      }),
      /** Schools: a low building on the street, and a field behind it. */
      school: Object.freeze({
        count: 5,
        spacing: 900,
        buildingShare: 0.34,
        apronShare: 0.16,
        greenShare: 0.5,
        footprint: 0.8,
        floors: Object.freeze({ min: 2, max: 3 }),
      }),
      /** One shopping centre: a big shed and a bigger car park. */
      shopping: Object.freeze({
        count: 1,
        spacing: 2000,
        buildingShare: 0.55,
        apronShare: 0.45,
        greenShare: 0,
        footprint: 0.9,
        floors: Object.freeze({ min: 2, max: 3 }),
      }),
      /**
       * Filling stations. Mostly forecourt, with a kiosk on it and planting at
       * the back — which is what a petrol station is, and why its building
       * share is the smallest of any facility here.
       */
      fuel: Object.freeze({
        count: 3,
        spacing: 1100,
        buildingShare: 0.2,
        apronShare: 0.55,
        greenShare: 0.25,
        footprint: 0.55,
        floors: Object.freeze({ min: 1, max: 1 }),
      }),
      /** Playing fields: all grass, with courts laid on it. */
      sports: Object.freeze({
        count: 4,
        spacing: 800,
        buildingShare: 0,
        apronShare: 0.22,
        greenShare: 0.78,
        footprint: 0,
        floors: Object.freeze({ min: 1, max: 1 }),
      }),
    }),
  }),

  /**
   * Grass on the blocks nothing is built on. See `city/groundCover.ts`.
   */
  groundCover: Object.freeze({
    /**
     * A hair above the terrain, and BELOW the asphalt.
     *
     * The island's shelf is exactly zero across the whole grid, so anything at
     * zero z-fights it — the same trick the road layers use. But it has to
     * stay under them: at 0.03 it was above both the asphalt and the road
     * markings, so a lawn meeting a carriageway drew over it and the roads
     * came out green.
     */
    y: 0.005,
    /** Overlapping patches per block, on top of the base one. */
    patches: 4,
    parkInset: 3,
    vacantInset: 5,
    /** Gardens start behind the houses, not at the footway. */
    gardenInset: 30,
  }),

  /**
   * Trees inside blocks rather than along streets: back gardens, parks and the
   * land nobody has built on. See `city/greenBlocks.ts` for why they cluster.
   */
  greenBlocks: Object.freeze({
    /** Behind the houses: `inset` clears the frontage and the buildings. */
    garden: Object.freeze({
      /**
       * Clears the deepest house: a villa is set back `frontYard` plus up to
       * `setbackJitter` and is now 25 deep, so its back wall can reach 36 from
       * the footway. Trees start behind that.
       */
      inset: 40,
      clusters: 4.4,
      perCluster: Object.freeze({ min: 4, max: 10 }),
      radius: 17,
      height: Object.freeze({ min: 6, max: 12 }),
    }),
    /**
     * A park block, planted right up to its own footway — and planted as
     * WOODLAND. The old density gave a park thirty trees, which from above is
     * an orchard; a city park is a canopy you cannot see the grass through in
     * places, and the whole point of a park in a district this size is that it
     * reads as green mass rather than as a lawn with specimens on it.
     */
    park: Object.freeze({
      inset: 5,
      clusters: 9,
      perCluster: Object.freeze({ min: 7, max: 14 }),
      radius: 30,
      height: Object.freeze({ min: 8, max: 17 }),
    }),
    /** Land nobody has built on: self-seeded, and it seeds thickly. */
    scrub: Object.freeze({
      inset: 8,
      clusters: 4,
      perCluster: Object.freeze({ min: 3, max: 9 }),
      radius: 24,
      height: Object.freeze({ min: 4, max: 11 }),
    }),
    /**
     * A vacant block on the city's outer edge, planted as FOREST.
     *
     * The island's woods now run right up to the last road, and against that
     * an empty edge block planted as scrub reads as a hole punched in the
     * treeline: the forest arrives, the city's last street crosses it, and
     * then there is a bald square. The land there is no more built on than the
     * land twenty metres outside the kerb, so it grows the same thing — the
     * wood simply continues across the road.
     *
     * Denser and taller than `scrub`, with clusters overlapping enough to
     * close into a canopy rather than reading as separate copses.
     */
    woodland: Object.freeze({
      inset: 6,
      clusters: 13,
      perCluster: Object.freeze({ min: 9, max: 18 }),
      radius: 26,
      height: Object.freeze({ min: 5, max: 16 }),
    }),
    /**
     * How every kind of open ground thickens toward the treeline.
     *
     * The forest has to arrive at the BUILDINGS, not at the last vacant lot,
     * so the boost applies to every kind of open ground — the middle of a
     * house block, a park, and the landscaped margin around each building.
     *
     * WHERE it applies is `finger` below, and only there. An earlier version
     * ramped it by plain distance from the city's edge, which pulled the wood
     * in from all four sides at once; that is the wrong shape. Only the two
     * sides that end on a north-south street take the forest inward, because
     * only there is there a street for it to cross. The north and south edges
     * close on their own east-west street and stop.
     *
     * The factors differ because the ground does. A vacant lot is already
     * woodland and only needs closing up; a garden is a thin strip behind the
     * houses and has to go from a lawn with specimens on it to a canopy; a
     * plot margin is the two metres between a wall and a kerb, where the CAP
     * rather than the density is what was keeping it bare.
     */
    forestEdge: Object.freeze({
      woodland: 0.6,
      garden: 2.4,
      park: 1.2,
      /** Extra trees per unit of plot margin, and extra room in its cap. */
      plot: 2.5,
      plotCap: 3,
      /**
       * How far the wood reaches in from the EAST and WEST edges, in whole
       * block rows.
       *
       * A north-south street does not stop the forest — it simply runs over
       * it — so on those two sides the wood comes in by the row rather than by
       * distance. A row is bounded above and below by the east-west streets
       * that define it, and those are what halt it. Depth is seeded per row so
       * the two interlock instead of the wood ending on a straight line.
       */
      finger: Object.freeze({
        /**
         * A row rolls between these, in block columns. The range runs well
         * past what `band` already reaches on its own — four rings — because
         * a finger that stops inside the distance ramp is not a finger at all,
         * it is the ramp. The deepest rows come two thirds of the way across
         * the city.
         */
        min: 1,
        max: 7,
        /**
         * Block columns kept clear either side of the tower whatever a row
         * rolls, so a finger can never reach the landmark's setting.
         */
        keepClear: 3,
      }),
    }),
    /**
     * The landscaped margin every building leaves inside its own plot.
     *
     * Six hundred plots' worth of green strip, and until now not one tree on
     * any of it — which is most of why a city with ten thousand street trees
     * still looked bare between the streets. This is the planting you actually
     * see from above: the streets are lines of trees, the plots are the mass
     * between them.
     */
    plot: Object.freeze({
      /** One tree per this much ground, so a big margin gets more. */
      areaPer: 260,
      /** Never more than this on one strip, whatever its area. */
      cap: 7,
      height: Object.freeze({ min: 5, max: 11 }),
      /** Kept off the kerb and off the wall. */
      inset: 2.5,
    }),
  }),

  skyline: Object.freeze({
    /** Annulus the distant silhouette occupies. */
    innerRadius: 900,
    outerRadius: 1600,
    count: 300,
    height: Object.freeze({ min: 120, max: 600 }),
    width: Object.freeze({ min: 40, max: 130 }),
  }),

  /**
   * Radius of the ground disc; sits outside the skyline and inside the fog.
   *
   * Only drawn when the island is off, but it still has to clear the grid's
   * far CORNER — 2400 out on both axes is 3400 away — or the streets run off
   * the edge of their own ground.
   */
  groundRadius: 3600,

  traffic: Object.freeze({
    /** Speed envelope in units per second. */
    speed: Object.freeze({ min: 14, max: 22 }),
    /**
     * Vehicle sizes. `length` runs with the direction of travel; every body is
     * modelled facing +Z, like the street furniture.
     */
    sizes: Object.freeze({
      car: Object.freeze({ width: 1.85, height: 1.5, length: 4.3 }),
      van: Object.freeze({ width: 2.05, height: 2.35, length: 5.8 }),
      bus: Object.freeze({ width: 2.5, height: 3.1, length: 11 }),
    }),
    /** Share of the fleet that is a van, and that is a bus; the rest are cars. */
    vanShare: 0.17,
    busShare: 0.07,
    /** Bumper-to-bumper gap kept in a stationary queue. */
    queueGap: 2.4,
    /**
     * How traffic density falls off with distance, per block pitch travelled
     * out from the tower.
     *
     * Sharing the fleet out purely by route length is the obvious rule and the
     * wrong one: the outer rings are far longer, so they took most of the
     * vehicles while the tower's own junctions — the only signalled ones, and
     * the ones actually on screen — were left with a couple of cars and never
     * formed a queue. A busy centre thinning outwards is both what a city
     * looks like and what puts the traffic where it can be seen.
     *
     * The decay is per PITCH, so on its own it cannot serve a grid this wide:
     * the streets run to 2400, which is thirteen pitches, and 0.5^13 is one
     * part in eight thousand. Every outer street was empty and the whole fleet
     * sat around the tower. Flattening the exponential instead just costs the
     * busy centre the test above demands.
     *
     * So the decay runs down to a FLOOR rather than to nothing: the centre
     * stays several times denser than the outskirts, which is what lets a
     * queue form at the tower's signals, while every outer street still gets a
     * share of the fleet instead of none at all.
     *
     * The floor sets how steep that is, and it cannot be small. At 5% the
     * centre was fourteen times the density of the outskirts, so the only way
     * to put traffic on the far streets was to jam the tower's own block
     * bumper to bumper first. A fifth flattens it to about three to one, which
     * is a busy centre rather than a gridlocked one.
     */
    ringDensityFalloff: 0.5,
    /** Share of centre density the furthest street still gets. */
    ringDensityFloor: 0.2,
    /**
     * Fleet size, by tier.
     *
     * Here rather than in the quality tiers because it is a property of the
     * GRID — how many cars it takes to look inhabited is set by how much road
     * there is — and because the traffic tests need the same number the app
     * ships. When the two drifted apart, the centre ring rounded down to a
     * single car in the test and nobody noticed.
     */
    fleet: Object.freeze({ full: 1200, mobile: 300 }),
    /**
     * Time headway a driver aims to keep. Speed is capped at gap / headway, so
     * closing on a queue or a red light slows a vehicle smoothly instead of
     * needing an explicit braking curve.
     */
    headwayS: 1.5,
    /** Acceleration and braking, units per second squared. */
    accel: 5.5,
    decel: 12,
    /**
     * Extra distance beyond the crossing at which a vehicle waits on red, so
     * it stops behind the stop bar rather than on the zebra.
     */
    stopMargin: 2.5,
    /** Points used to round each loop corner. */
    cornerSegments: 4,
    /**
     * Corner turn radius. Bounded by the narrowest asphalt: at the midpoint of
     * a turn a lane sits `laneOffset + 0.293 * radius` from the centreline, so
     * anything above ~6 would swing the inner lane off a secondary road.
     */
    cornerRadius: 5,
  }),

  pedestrians: Object.freeze({
    speed: Object.freeze({ min: 1.1, max: 1.8 }),
    /** Figure height; shoulder width sets the queueing footprint. */
    height: 1.62,
    shoulders: 0.44,
    /** Depth along the direction of walking, for the following gap. */
    depth: 0.3,
    /** Gap kept from the person in front while queueing at a kerb. */
    queueGap: 0.45,
    /** Kinetics. People start and stop far more sharply than vehicles do. */
    headwayS: 1.1,
    accel: 1.6,
    decel: 3.2,
    /**
     * A walker bobs by this much, scaled by how fast they are actually going,
     * so someone held at a kerb stands still. It is the cheapest possible read
     * on who is waiting and who is moving.
     */
    bob: 0.055,
    /** Bob cycles per unit walked. */
    bobRate: 1.35,
    /**
     * Walkers per junction circuit. Deliberately small: all four corners of a
     * circuit are gated by one signal, so a long queue would back up onto the
     * zebra the walker behind is still standing on.
     */
    perCircuit: 3,
  }),

  signals: Object.freeze({
    greenMs: 9000,
    yellowMs: 1800,
    redMs: 9000,
    /** Height to the underside of the signal head. */
    postHeight: 4.4,
    /** Set back this far from the outer edge of the walkway. */
    postInset: 0.4,
    /** Signal head: three aspects stacked on the face turned to the junction. */
    lampRadius: 0.15,
    lampPitch: 0.42,
    /**
     * Warm lens under each street lamp's head.
     *
     * Height, and a footprint slightly larger than the housing it hangs from.
     * The camera looks down on the city, so a lens tucked under a wider housing
     * shows nothing at all — it has to stand proud of it to be seen from above,
     * and have sides to be seen from a low angle.
     */
    lampLens: Object.freeze({ height: 0.22, overhang: 1.5 }),
  }),

  /**
   * Per-density caps. The quality tier picks one; the UI can override it.
   *
   * Buildings are thinned by a coverage fraction applied everywhere rather
   * than by a count with the far edges dropped: cropping the edge of a city
   * this wide reads as a bug, a sparser one reads as a setting. Props are
   * thinned by scaling their spacing instead: slicing a distance-sorted list
   * would leave a visible circular edge where the planting stopped, whereas a
   * wider spacing reads as a sparser city everywhere.
   */
  density: Object.freeze({
    low: Object.freeze({ buildingCoverage: 0.5, skyline: 140, propScale: 2.2 }),
    medium: Object.freeze({ buildingCoverage: 0.75, skyline: 220, propScale: 1.5 }),
    high: Object.freeze({ buildingCoverage: 1, skyline: 300, propScale: 1 }),
  }),
})

export type CityConfig = typeof cityConfig

/** Half-width of the road reserve (asphalt + both sidewalks) for a road class. */
export function roadReserve(main: boolean, c: CityConfig = cityConfig): number {
  const half = main ? c.roads.mainHalfWidth : c.roads.secondaryHalfWidth
  return half + c.roads.sidewalkWidth
}
