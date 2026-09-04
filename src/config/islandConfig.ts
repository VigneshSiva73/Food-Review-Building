/**
 * The island.
 *
 * Scale is set against the city, not chosen freely: the street grid reaches
 * 540, the skyline annulus ends at 1600, and the city's ground disc is 1800.
 * The island has to be several times that before the city stops dominating it,
 * which is what §39 of the brief asks for.
 *
 * NOTHING HERE IS MEASURED FROM THE TOWER. Two earlier islands were rejected,
 * and both were built the same way — a radius from the origin, wobbled. The
 * shape of this one comes from a noise field that is thresholded at sea level,
 * so the coastline is whatever the noise happens to make and no part of the
 * generator knows where the middle is. The only exception is the shelf the city
 * physically stands on, which has to be flat because the streets are.
 */

export const islandConfig = Object.freeze({
  /**
   * Chosen by search, not by taste.
   *
   * The landform is a thresholded noise field, so where the land falls is the
   * noise's business — but the city has to stand ON it, with enough room
   * outward for suburbs, forest and mountains before the coast. Rather than
   * bias the field upward near the tower, which is the radial technique that
   * got the last two islands rejected, candidate seeds were generated and
   * scored on land fraction, distance to the nearest sea, and peak height.
   * This one clears all three. The shape is still entirely the noise's.
   */
  seed: 'island-32',

  world: Object.freeze({
    /** Half the side of the square the terrain covers. */
    halfExtent: 9200,
    /**
     * Cells across the generation grid.
     *
     * Erosion and drainage need a grid, not a continuous function: water has to
     * be routed from each cell to its lowest neighbour, and that is a question
     * about neighbours. 512 over 12800 units is a 25-unit cell, fine enough for
     * a river to be a river.
     */
    resolution: 576,
    /**
     * Sea level, below the city's own zero.
     *
     * A real drop, so the city stands on a plateau above the water with room
     * for cliffs and beaches under it rather than paddling at the waterline.
     */
    seaLevel: -70,
  }),

  /**
   * The land mask: a warped noise field thresholded at sea level.
   *
   * `bias` lifts the field so that rather more than half of it comes out above
   * water — without it a zero-mean noise field gives an archipelago. The lift
   * is uniform across the whole domain, so it changes how MUCH land there is,
   * never where it is.
   */
  land: Object.freeze({
    warpStrength: 2600,
    warpFrequency: 0.000085,
    bias: 0,
    shape: Object.freeze({
      octaves: 6,
      lacunarity: 2.05,
      gain: 0.52,
      frequency: 0.00009,
    }),
    /**
     * Only the outermost band of the domain is pushed under water, so the
     * island cannot run off the edge of its own mesh. Everything inside is
     * decided by the noise alone.
     */
    edgeMargin: 0.17,
  }),

  relief: Object.freeze({
    /**
     * Height the general land surface settles at.
     *
     * Just above the city's own zero, and that is the whole constraint. The
     * city is built at y = 0 and cannot move, so a plain standing at 210 put it
     * at the bottom of a two-hundred-unit crater with the suburbs looking down
     * into it. The relief belongs in the mountains, which are free to rise as
     * far as they like, not in the baseline the city has to match.
     */
    landAmplitude: 25,
    /**
     * How quickly land climbs to its full height once past the waterline.
     *
     * Small, and load-bearing. At 0.28 the ground rose so gradually that the
     * whole coastal plain sat inside the height band the beach colouring uses,
     * and the island came out as sand with a green middle. The shore has to get
     * up out of the water quickly for a beach to be a beach.
     */
    shoreRise: 0.05,
    /** Rolling detail on top of it. */
    detail: Object.freeze({
      amplitude: 80,
      octaves: 5,
      lacunarity: 2.2,
      gain: 0.5,
      frequency: 0.00042,
    }),
    /**
     * The mountains, as ridged noise gated by its own mask.
     *
     * Gated by a SEPARATE low-frequency field rather than by height or by
     * distance, so the ranges land where that field happens to peak — several
     * of them, in different places, at different sizes. Gating on altitude
     * instead just puts a crown on whatever is already tallest, and gating on
     * distance from the middle is the radial trap again.
     */
    mountains: Object.freeze({
      amplitude: 700,
      maskFrequency: 0.00027,
      /** Mask value below which no mountain grows at all. */
      maskFloor: -0.10,
      ridged: Object.freeze({
        octaves: 6,
        lacunarity: 2.15,
        gain: 0.5,
        frequency: 0.00052,
      }),
    }),
  }),

  /**
   * The flat ground the city physically needs.
   *
   * Every street, kerb, plaza and building footprint is built at y = 0, and
   * depth resolves only about half a scene unit at the distance the city is
   * viewed from — so the terrain under it has to be exactly flat, not nearly.
   * Sized to the street grid and no larger. The flat area is what reads as bare
   * brown ground, so any of it the roads do not reach is a plain nobody built
   * on — which is exactly what it looked like, three times running.
   *
   * Two separate things were making that gap, and both are closed here. The
   * shelf is now the grid's own BOX rather than a square around the origin, so
   * it cannot overhang the side the streets fall short on; and `blendMargin`
   * is 500 rather than 1500, so the ground wash fades out just past the last
   * kerb instead of trailing a brown halo half the width of the city again.
   *
   * The flat cannot simply grow to swallow the gap instead. On a square ring
   * 3400 out, 12 of 64 samples are already below sea level and the highest is
   * near 400 — a shelf that far would flatten the coastline and shave the
   * hills off. Around 2450 is the last extent that is genuinely all dry, level
   * ground, so that is where both the flat and the grid stop.
   */
  shelf: Object.freeze({
    /**
     * The grid's own bounds, as a box rather than a half-extent around the
     * origin.
     *
     * The paved area runs -2519 to 2519 on both axes; these add a kerb's worth
     * of margin on top. Written as four edges because nothing guarantees the
     * seeded block spans stay symmetric — if they ever stop being, the flat
     * follows the streets instead of overhanging the short side, and
     * `shelf.test.ts` fails on the config rather than on the render.
     */
    minX: -2600,
    maxX: 2600,
    minZ: -2600,
    maxZ: 2600,
    /**
     * Barely rounded. The streets meet at square corners, and the flat has to
     * clear them by a whole terrain cell — heights are sampled on a 32-unit
     * grid and read back bilinearly, so a corner that is only just inside the
     * shelf still interpolates against sloping neighbours and comes back a
     * fraction below zero.
     */
    cornerRadius: 60,
    blendMargin: 500,
  }),

  /**
   * What flies over the island. See `air/aircraft.ts`.
   *
   * Everything here is a pure function of the clock rather than something that
   * accumulates, because the world freezes whenever traffic and pedestrians
   * are both off — and a fleet that had been integrating would stop wherever
   * it happened to be, while a phase-based one is just a photograph of a sky.
   */
  air: Object.freeze({
    /** They wrap within this, so nothing ever drifts off the map. */
    halfExtent: 4200,
    balloons: Object.freeze({
      count: 34,
      altitude: Object.freeze({ min: 260, max: 980 }),
      radius: Object.freeze({ min: 16, max: 30 }),
      /** Slow: a balloon crossing the island in a minute is a bird. */
      speed: Object.freeze({ min: 3.5, max: 8 }),
      bob: Object.freeze({ min: 4, max: 14 }),
    }),
    parachutes: Object.freeze({
      count: 26,
      release: Object.freeze({ min: 620, max: 1150 }),
      /** Where a canopy is cut away and the cycle restarts. */
      groundY: 40,
      radius: Object.freeze({ min: 7, max: 11 }),
      drift: Object.freeze({ min: 5, max: 11 }),
      /** Descents per second — one every two to four minutes. */
      rate: Object.freeze({ min: 0.004, max: 0.008 }),
    }),
    helicopters: Object.freeze({
      count: 9,
      altitude: Object.freeze({ min: 180, max: 620 }),
      /** Length of a leg. Chords across the island, never orbits. */
      leg: Object.freeze({ min: 2600, max: 6400 }),
      climb: 140,
      arc: Object.freeze({ min: 30, max: 110 }),
      /** Legs per second. */
      rate: Object.freeze({ min: 0.012, max: 0.026 }),
      scale: Object.freeze({ min: 0.85, max: 1.35 }),
      /** Radians per second of rotor. Fast enough to blur, not to strobe. */
      rotorSpeed: 26,
    }),
  }),

  /**
   * Swell on the shallow sheet. See `scene/island/oceanWaves.ts`.
   */
  ocean: Object.freeze({
    /**
     * Overall scale on the wave heights, which are no longer free numbers.
     *
     * Each component's height now comes from its own STEEPNESS and wavelength
     * (see `oceanWaves.ts`), so this is a single multiplier on a sea that is
     * already internally consistent rather than four amplitudes to balance by
     * hand. At 0.34 the 980-unit swell stands about 6 units crest to trough —
     * a steepness near 0.04, which is open-ocean swell. Raise it and the sea
     * gets rougher in the way a real one does, short waves included.
     */
    amplitude: 0.34,
    /**
     * Where the clock starts.
     *
     * Non-zero, because the world can be frozen — traffic and pedestrians both
     * off — and every wave sits at its zero crossing at t = 0, which is a flat
     * sheet. A still sea should look like a photograph of water.
     */
    restPhase: 137.5,
    /**
     * How hard the crests are pinched, as a multiple of the pure trochoid.
     *
     * Gerstner's horizontal shuffle at full strength gives the exact trochoid;
     * more than that sharpens the crest further, and enough more would fold it
     * over itself into a loop. The fold happens when the summed `steepness x
     * choppiness` of the displaced components reaches 1, which here is 0.216 x
     * choppiness — so anything below about 4.6 is safe, and 2.4 gives a crest
     * with an edge on it while staying well clear.
     */
    choppiness: 2.4,
    /**
     * Seconds of wave time per second of world time.
     *
     * 1, not 0.55: the components now travel at sqrt(g k) rather than at
     * invented speeds, so wave time IS time. The long swell takes about 25
     * seconds to pass, which is what a 980-unit swell does.
     */
    speed: 1,
  }),

  /**
   * The rivers drawn on top of the channels the drainage cut.
   *
   * These are thresholds on the existing flow field, not a river design: the
   * courses were decided when the water was routed downhill.
   */
  rivers: Object.freeze({
    /** Accumulated flow at which a watercourse is worth drawing at all. */
    minFlow: 60,
    /** Points below which a trace is a stub rather than a river. */
    minPoints: 6,
    /** Guard against a trace that somehow fails to terminate. */
    maxSteps: 3000,
    minWidth: 14,
    maxWidth: 78,
    /** How far the water surface sits above the channel bed. */
    surfaceLift: 2.5,
  }),

  /**
   * Where people live outside the city.
   *
   * Every figure is a property of the GROUND — how steep, how high, how close
   * to water — so settlements are founded where a settlement would have been
   * founded. There is deliberately no term for distance from the tower: a
   * density fading outward from it would put a ring of suburbs round the city,
   * which is the concentric look this island exists to avoid.
   */
  settlements: Object.freeze({
    /** Spacing of the candidate grid the sites are drawn from. */
    candidatePitch: 260,
    /** Score below which ground is not worth founding on. */
    minScore: 0.42,
    /**
     * Accumulated flow at a site above which it is a town on a river rather
     * than a hamlet on ordinary ground.
     */
    townFlow: 45,
    /** Places are separate places, not one smear of building. */
    minSpacing: 900,
    maxPlaces: 34,

    /** Buildable ground: slope, altitude, and a clearance above the tide. */
    slopeEasy: 0.16,
    slopeHard: 0.55,
    minAbove: 22,
    maxAltitude: 260,

    /** Access to water counts for a lot when siting a settlement. */
    baseline: 0.45,
    waterScale: 30,
    waterBonus: 0.4,
    coastNear: 320,
    coastFar: 1400,
    coastBonus: 0.5,

    /** How far the built-up area reaches, by kind. */
    radius: Object.freeze({ suburb: 340, village: 210, coastal: 240 }),

    /** Plot layout inside a place. */
    plotPitch: 34,
    plotSize: 15,
    storeyHeight: 9,
    density: 0.72,
    /** A plot still has to pass the terrain test, which is what thins the edges. */
    minPlotScore: 0.3,
  }),

  /**
   * Walking trails, from the roads to the places worth walking to.
   *
   * The same weights a road uses, with the gradient penalty cut hard: a walker
   * climbs where a car has to switchback, and a stream is a stepping stone
   * rather than a bridge. That difference is the whole character of a footpath.
   */
  trails: Object.freeze({
    gradePenalty: 4,
    bridgeFlow: 400,
    bridgeCost: 40,
    sharedDiscount: 0.5,
    minPoints: 5,
    maxSteps: 3000,

    /** Destinations worth a path. */
    maxWaterfalls: 12,
    maxViewpoints: 10,
    viewpointHeight: 300,
    viewpointSpacing: 1300,
    maxBeaches: 10,
    beachAbove: 40,
    beachReach: 120,
    beachSpacing: 1500,

    /** A trail is a footpath, not a lane. */
    width: 5.5,
    surfaceLift: 1.1,
  }),

  /**
   * Boats.
   *
   * §37 asks for a few, slowly, and §38 for them to thin out offshore. Both are
   * one rule: acceptance falls with the depth of water under the hull, so the
   * gradient appears without anything being placed in bands.
   */
  boats: Object.freeze({
    count: 26,
    /** A hull needs water under it. */
    minDepth: 26,
    /** Depth by which the sea is essentially empty. */
    busyDepth: 240,
    anchoredShare: 0.38,
    minLength: 26,
    maxLength: 64,
  }),

  /**
   * Boulders and outcrops.
   *
   * All keyed to where soil does not stay: steep faces, watercourses and the
   * surf line. §29's four categories are one score, not four rules.
   */
  rocks: Object.freeze({
    pitch: 90,
    slopeFrom: 0.45,
    slopeTo: 1.1,
    flowScale: 34,
    shoreNear: 40,
    shoreFar: 190,
    threshold: 0.24,
    density: 0.5,
    minRadius: 3.5,
    maxRadius: 15,
  }),

  /**
   * The road network, found by least cost across the terrain.
   *
   * These are the weights that decide what a road would rather do than climb.
   */
  roads: Object.freeze({
    /** Terrain cells per lattice node. A road needs less resolution than water. */
    stride: 3,
    /**
     * How dearly a road pays for gradient, squared.
     *
     * The single number that decides whether roads contour and switchback or
     * drive straight over the tops. Squaring is what makes a long way round
     * cheaper than a short climb.
     */
    gradePenalty: 26,
    /** Flow above which crossing means a bridge. */
    bridgeFlow: 90,
    bridgeCost: 260,
    /**
     * What it costs to share a road somebody already built.
     *
     * Well under one, so chains merge into trunks rather than running parallel
     * — the difference between a network and a fan of spokes from the city.
     */
    sharedDiscount: 0.42,
    minPoints: 4,
    /** Width of a lane, and how much a trunk widens per settlement served. */
    baseWidth: 13,
    widthPerUser: 2.6,
    maxWidth: 34,
    /** How far the surface sits above the ground it follows. */
    surfaceLift: 1.4,
  }),

  /**
   * Waterfalls, found on the rivers rather than placed on the map.
   *
   * Every river point already carries the drop to the one below it, so these
   * are thresholds on that — §11's "not randomly on flat land" is guaranteed by
   * construction rather than by a rule.
   */
  waterfalls: Object.freeze({
    /** Drop between adjacent river points before it counts as a fall. */
    minDrop: 9,
    /** Total height below which a fall is a rapid, not a landmark. */
    minHeight: 26,
    minWidth: 16,
    /** Kept to the biggest, so the island has landmarks rather than dribbles. */
    maxCount: 40,
    /** How far the mist plume rises relative to the fall's height. */
    mistRise: 0.34,
  }),

  /**
   * What grows, where.
   *
   * Every figure here is a threshold on something the terrain already knows —
   * slope, altitude, and the wetness the drainage computed — so vegetation
   * cannot disagree with the ground it stands on.
   */
  vegetation: Object.freeze({
    /** Trees on a desktop-class device. Mobile takes a fraction. */
    /**
     * Trees on the island, and now a real budget rather than a hint: the
     * sampler honours it exactly. Raised from 26,000 — which was quietly
     * producing 50,283 — because the city's wooded fringe needs the density
     * and it is better to pay for it deliberately than by accident.
     */
    count: 40_000,
    countLow: 9_000,
    /** How much the jittered grid over-supplies, so rejection has room to work. */
    oversample: 14,
    /** Clusters: forests and clearings, not an even scatter. */
    cluster: Object.freeze({
      octaves: 3,
      lacunarity: 2.1,
      gain: 0.55,
      frequency: 0.00082,
    }),
    /**
     * Cluster value below which nothing grows, and above which growth is full.
     *
     * The floor was high enough, against a coarse cluster mask, that one lobe
     * of the noise took nearly all the forest and half the island came out
     * bare. A finer mask and a lower floor spread the woods over the whole
     * landmass while keeping the clearings that make it read as forest.
     */
    clusterFloor: 0.22,
    clusterFull: 0.62,
    /** Bare sand next to the water carries nothing. */
    shoreClearance: 14,
    /**
     * The wooded belt around the city, in world units outside the built plain.
     *
     * Inside this band the forest density has a FLOOR rather than being left
     * to the cluster mask, because the mask has no idea the city is there: it
     * left the treeline two hundred units short on one side, thirteen hundred
     * on the diagonal, and on a third side put no trees within two thousand at
     * all. Slope and the tree line still veto it, so the belt breaks properly
     * for a cliff, and it fades out over its last quarter into whatever the
     * natural forest is doing beyond.
     */
    fringeBand: 900,
    fringeDensity: 0.62,
    /**
     * How close the forest may stand to a street, beyond the asphalt's own
     * half-width.
     *
     * The forest is allowed inside the shelf now — see `vegetationAt` — but
     * only on the ground BEYOND the last block, where the streets overhang the
     * grid. This is what keeps it off their tarmac: the sidewalk is three wide,
     * so six leaves a verge either side.
     */
    roadClearance: 6,
    /** Slope at which growth starts thinning, and at which it stops. */
    slopeEasy: 0.34,
    slopeBare: 0.95,
    /** Altitudes at which the tree line begins and ends. */
    treeLine: 300,
    barrenLine: 470,
    /** Damp ground grows more; taken from the drainage's own flow figure. */
    wetnessScale: 26,
    wetnessBonus: 0.55,
    /** Height above the water below which palms dominate, and above which conifers do. */
    palmBand: 46,
    coniferBand: 240,
  }),

  /**
   * Where the camera stands to look at the whole island.
   *
   * Authored, not fitted. A fit would frame the bounding box, and the box is
   * not the interesting thing — the composition is: coast in front, the city
   * behind it, the ranges behind that. High enough that the land is presented
   * to the viewer, because at a grazing angle a mostly-flat island foreshortens
   * into nothing and reads as more sea.
   */
  view: Object.freeze({
    position: [-4200, 6600, -11800] as [number, number, number],
    target: [-300, 0, 600] as [number, number, number],
  }),

  /**
   * Drainage.
   *
   * Rivers are not drawn. Water is routed downhill from every cell, the flow
   * accumulated, and channels cut where enough of it collects — which is how
   * real valleys form and why the result branches like a river system instead
   * of like a decorative line. §27's "shaped by water over time" is meant
   * literally here.
   */
  hydrology: Object.freeze({
    /** Passes of depression filling, so water is never trapped in a pit. */
    fillIterations: 12,
    /** Accumulated upstream cells before a channel is cut at all. */
    channelThreshold: 55,
    /**
     * Accumulation at which a channel reaches full depth and width.
     *
     * Measured, not guessed. This was first set at 3200 against a largest river
     * that actually carries about 1600 cells — so no channel on the island ever
     * reached full incision and every river was a scratch. The figure has to sit
     * inside the range the drainage really produces.
     */
    channelFull: 1300,
    maxIncision: 34,
    /** How far the carve spreads sideways, in cells, at full flow. */
    maxBankCells: 3,
  }),
})

export type IslandConfig = typeof islandConfig
