/**
 * Geometry constants for the building. Scene units: 1 unit ≈ 1 metre.
 * All builders must read from here — no magic numbers in geometry code.
 */

export type StackingMode = 'leveled' | 'organic'

export const buildingConfig = Object.freeze({
  /**
   * Rating → pillar height mapping (see plan §12). Doubled from 2.5–6.5, then
   * raised half as much again, and now by a further two fifths: taller storeys
   * read as open floors carried on columns rather than as a stack of thick
   * plates. `moduleHeight()` derives from these, so the whole tower grows with
   * them — and so does the span of the glazing, which runs from a module's
   * base to its own soffit.
   *
   * That rise went with a widening, but NOT in step with it: the plan grew by
   * 2.15 and the height by 1.4, taking the tower from nine times its own width
   * to under six. Scaling both equally would have given the same silhouette at
   * a larger size, and the brief was that the building should read as broader,
   * not merely as further away.
   *
   * The 1.18 on top of that IS uniform, plan and height together, because the
   * ask there was for a slightly bigger building rather than a differently
   * shaped one. That step held the proportion at 5.8 to 1.
   *
   * These are then DOUBLED again, and this pair alone — the slab, deck and gap
   * below are untouched. Doubling the column and nothing else is what turns a
   * storey into an open hall: the structure between floors stays the same
   * couple of units it always was, so all the new height goes into the glazed
   * volume the columns stand in, and the plate reads as carried rather than
   * stacked. It very nearly doubles the module, and with it the tower, which
   * comes back to eleven times its own width.
   */
  pillarHeightMin: 24.8,
  pillarHeightMax: 64.4,

  /** Structural data column cross-section (chamfered, fluted box). */
  pillarWidth: 9.15,
  /**
   * Radial segments in the column's circular section.
   *
   * The columns are cylinders, so smoothness is bought here rather than with
   * chamfers and flutes. Ten reads round at the distances the tower is
   * actually viewed from, and it is what the 300-floor triangle budget allows:
   * the joint heads and base collars are round too, so a segment added here is
   * charged five times over on every column, three columns to a floor.
   */
  pillarSegments: 10,
  /**
   * Non-data support post (Saturdays / missing meals). Matches `pillarWidth`
   * and must keep matching it: a slim post beside a full-width pillar read as
   * a toothpick holding up a floor, which no real structure does. The "no
   * review here" signal is carried by the dark anodized `support` material
   * instead of by a thinner section.
   */
  supportWidth: 9.15,

  /**
   * Triangular footprint.
   *
   * Sized to its site, and the site has grown with it twice. At 56 the plate
   * reached 40 of the plaza's 79; 104 took it to 72 of the same 79; 224 took
   * it to 158 of the 169 a two-pitch plaza gives, and 264 reaches 187 of the
   * 200 a 2.35-pitch one gives. Every step has kept the plate at 93–94% of
   * its block. A triangle in a square always leaves the paving widest at the
   * middle of each elevation: that is the geometry, not a gap to be closed.
   *
   * Unlike the last widening, the column cross-section goes with it. A plate
   * this broad on the old 3.6 columns is the toothpick failure the support
   * post's own note warns about, so `pillarWidth`, `plateEdgeRadius` and the
   * fin module are all scaled by the same 2.15 and the elevation keeps its
   * proportions. The rating-to-height mapping is still untouched.
   */
  triangleSide: 264,
  /** Rear (Dinner) corner pushed back by this fraction of the side. */
  rearCornerOffset: 0.08,

  /**
   * Distance from a column centre to the plate edge — everywhere.
   *
   * The one number that shapes the plate. Each elevation is offset from the
   * column line by this much, and each corner sweeps round its column on an
   * arc of this radius, so it is both the reveal past the columns and the
   * radius of the tower's three rounded corners.
   *
   * It must stay above a column's own reach from its centre — 1.87 at the
   * current width, allowing for the per-floor variation — or the plate stops
   * covering the column heads; a test pins that.
   *
   * Round columns let this come in a long way. A square column reaches
   * furthest at its corners, so the plate had to clear a half-DIAGONAL of
   * 2.65; a cylinder reaches the same distance in every direction, so the
   * plate can sit as a slim ring around it. At each corner the column's own
   * wall is effectively the slab edge — which is the point, since the corner
   * is where the column is on show.
   *
   * Sized against the worst point, not the nominal radius, because two things
   * eat into it. The corner is a polyline of `plateCornerSegments` chords
   * across 120°, and a chord sags inside the arc it approximates — about 3% at
   * 30° a step. And the offset is taken in the slab's own TILTED plane, so its
   * horizontal projection is shorter again by the cosine of that tilt, which
   * grows with the spread of the day's ratings. 2.1 is what still leaves a
   * real 0.1 of concrete past the column wall once both have been paid.
   */
  plateEdgeRadius: 5.3,
  /**
   * Arc steps per corner. Four is the most a 120° sweep can have and stay
   * inside the 300k triangle budget at 300 floors — the plate is fanned from
   * its own centre, so every extra outline point costs twelve vertices on
   * every floor in the tower.
   */
  plateCornerSegments: 4,

  /** Tilted slab plate. */
  slabThickness: 0.66,
  /** Flat ring-beam deck at each module base. */
  deckThickness: 0.58,
  deckBeamWidth: 1.27,
  /** Minimum clear facade band between slab top and next deck. */
  facadeMinGap: 0.74,

  /** 'leveled' (default, plumb tower) or 'organic' (experimental drift). */
  stackingMode: 'leveled' as StackingMode,

  /** Deterministic per-floor variation amplitude (fraction, bounded). */
  variationAmplitude: 0.04,
  /**
   * Per-floor concrete shade spread, as a fraction either side of the base
   * tone. Its own knob rather than reusing `variationAmplitude`, because a
   * cross-section can take far less deviation before it looks wrong than a
   * surface tone can: 4% on a column width is invisible, 4% on a colour is
   * barely there. Lives here beside the other variation amplitude rather than
   * in `materialsConfig`, which describes materials, not per-floor spread.
   */
  concreteShadeAmplitude: 0.055,
  /** How far a day's glazing tone may fall below full, for occupancy variety. */
  glassLitSpread: 0.3,

  /** Extra per-floor gap in the explode/floor-separation view. */
  explodeGap: 4.1,

  /** Facade: legacy inset, retained for the capital/joint geometry. */
  facadeInset: 0.89,
  /**
   * Gap between the head of the glazing and the plate above it.
   *
   * Zero, and deliberately so. The plate overhangs to exactly the line the
   * glass now sits on, so any clearance here is a lit strip of soffit showing
   * above the glass on every elevation of every floor — which is precisely the
   * gap this was reported as. The two surfaces meet in a line rather than
   * sharing a plane, so there is nothing here to z-fight.
   */
  glassHeadClearance: 0,
  /**
   * Vertical fins on the glazing. `mullionDepth` is how far a fin projects,
   * `mullionWidth` its thickness along the facade — the instance's local axes
   * make the names read backwards, so both are applied explicitly.
   *
   * Spacing is architectural, not a curtain-wall module. At 1.8 the fins
   * became a comb at any distance where the whole tower fitted on screen,
   * which is nearly always.
   */
  mullionWidth: 0.26,
  mullionDepth: 0.89,
  mullionSpacing: 15,

  /** Graphite fascia beam wrapping the tilted slab edges. */
  fasciaWidth: 0.18,
  fasciaHeight: 0.55,
  /**
   * Profile of that beam, as fractions of its own section.
   *
   * A shadow gap along the top where the beam meets the plate, and a drip
   * notch underneath. Both are what an edge beam actually has — the notch
   * stops water tracking back along the soffit — and both read as crisp
   * horizontal lines wrapping the building, which is the point: they give
   * every floor a defined edge instead of a flat band.
   */
  fasciaRevealDepth: 0.34,
  fasciaDripDepth: 0.28,

  /** Capital block covering each pillar/slab joint. */
  capitalHeight: 0.5,
  // 1.05, not more: the joint head is a collar on the column, and anything
  // wider than `plateEdgeRadius / (pillarWidth / 2)` — 1.11 as those stand —
  // would hang outside the plate it is bolted to.
  capitalWidthFactor: 1.05,
  /**
   * The joint head is a stepped steel collar: a narrower body between two
   * flange plates, as fractions of the capital's own block.
   *
   * Deliberately stepped rather than gusseted. Radial gussets on a square
   * section read as clutter from anywhere except directly side-on, and would
   * cost more triangles than they communicate on a member instanced three
   * times per day.
   */
  jointBodyInset: 0.7,
  jointFlangeHeight: 0.2,

  /**
   * Concrete downstand ribs spanning column to column under the plate.
   *
   * These hang beneath the soffit, never at the module base. A ring of beams
   * at the base datum was tried once and removed: it read as a floor slab
   * between days, which the building does not have.
   */
  soffitRibWidth: 0.5,
  soffitRibDepth: 0.42,

  /** Stepped column base plate; the step is this fraction of the plate. */
  basePlateStepInset: 0.68,

  /**
   * Rooftop helipad marking, painted on the flat top of the highest plate.
   *
   * Sized against the plate rather than the tower: the footprint's inradius is
   * about 30, so a 13 circle sits well inside the triangle at any rating
   * spread. The marks stand slightly proud rather than lying in the plate's
   * surface — two coplanar faces are z-fighting, and this one would flicker
   * across the whole roof.
   */
  helipad: Object.freeze({
    radius: 13,
    ringWidth: 1.2,
    ringSegments: 48,
    letterHeight: 14,
    letterWidth: 9,
    barWidth: 2,
    /** Thickness of the painted marks, and how far the group clears the plate. */
    markThickness: 0.12,
    lift: 0.08,
  }),

  /**
   * Glass spire crowning a month whose reviews are finished.
   *
   * A three-sided pyramid on the building's own plan, not a cone: the tower is
   * a triangle from the ground up — three columns, one per meal — and a round
   * top would be the one element in it that belongs to a different building.
   *
   * Its base is flush with the plate edge, worked out from `slabOverhang` and
   * not from a factor of the column footprint. Springing it off the column
   * centrelines instead left a visible ring of bare plate all round, which
   * read as the spire having been dropped on the roof rather than grown out of
   * the building.
   *
   * The height is set against the plan's reach — about 160 from the centre to
   * a corner — and deliberately well over it. A pyramid much shallower than
   * this reads as a hipped roof put on the building; what is wanted is a
   * spire, so the faces run steep and the apex is a true point.
   */
  crown: Object.freeze({
    height: 240,
    /**
     * Radius of the fillet that takes the sharp point off the top.
     *
     * A true tangent fillet, not a chamfer: the faces run dead straight and
     * then curve into a dome without a crease, so the crown finishes rather
     * than stopping. Sized against the spire, not against the plan — on a
     * 240 rise this rounds roughly the last 12 per cent, which reads as a
     * finished tip from the ground and still leaves the thing a spire.
     *
     * Note the consequence: the real top of the crown is BELOW `height`, which
     * is the apex the straight faces are aimed at rather than a height the
     * geometry reaches.
     */
    tipRadius: 18,
    /** Rings across the fillet. Eight is where the silhouette stops stepping. */
    capSegments: 8,
    /**
     * Beacons up the three ribs, as fractions of the straight rise.
     *
     * A countable number of lamps, deliberately — the crown is glazed but
     * nobody works in it, so it is lit the way a mast is lit and not the way a
     * floor is. Four stops leaves a clear gap between each and the next at the
     * distance the tower is normally seen from; closer spacing turns into a
     * dotted line and reads as a string of fairy lights.
     */
    lightStops: Object.freeze([0.18, 0.42, 0.66, 0.9]),
    /**
     * Beacon size. Small against a 240 spire — these have to read as fittings
     * on the structure rather than as lamps hung off it — but not so small
     * they disappear before the tower does.
     */
    lightRadius: 2.6,
    /** How far the base clears the plate, so the two are never coplanar. */
    lift: 0.08,
  }),

  /** Ground-level plinth. */
  podiumHeight: 0.45,
  /**
   * Plinth spread, as a multiple of the footprint.
   *
   * Was 1.4, which was comfortable when the plate reached 40 into a 79 plaza.
   * At the tower's site-filling size the same multiple would push the plinth
   * to 96 — out past the plaza edge, across the bollards and onto the footway.
   * A base course is all that is wanted now, and a test pins it inside the
   * block so the two can never drift apart again.
   */
  podiumScale: 1.06,
})

/**
 * In-plane distance from each column centreline to the plate edge.
 *
 * A pass-through now, and kept as a function because every caller asks the
 * same question and should keep asking it in one place. It used to be a sum of
 * three terms — the column's half-diagonal, what the corner fillet cut back,
 * and a reveal — because the plate was a scaled triangle whose corners were
 * then filleted, and the fillet had to be paid for by scaling out further. The
 * plate now wraps the columns directly, so the reveal is simply the radius.
 */
export function slabOverhang(c: BuildingConfig = buildingConfig): number {
  return c.plateEdgeRadius
}

/** Constant vertical band occupied by one day module (leveled mode). */
export function moduleHeight(c: BuildingConfig = buildingConfig): number {
  return c.pillarHeightMax + c.slabThickness + c.deckThickness + c.facadeMinGap
}

export type BuildingConfig = typeof buildingConfig
