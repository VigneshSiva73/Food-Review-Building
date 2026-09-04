import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  buildingConfig,
  materialsConfig,
  moduleHeight,
  slabOverhang,
  timeOfDayConfig,
  type MaterialSpec,
} from '@/config'
import { footprintCorners } from '@/building'
import type { Vec3 } from '@/types'
import { plateOutline } from '@/building/slabGeometry'
import { GLASS_TILE_FLOORS } from '@/building/facade'
import { heroConcreteTexture } from './heroConcreteTexture'
import { heroCrownNightTexture, heroGlassNightTexture } from './heroGlassNightTexture'

/**
 * Module-scoped shared geometries and materials (plan §32): every repeated
 * element in the building reuses these — instancing keeps draw calls flat.
 */

function makeStandard(
  spec: MaterialSpec,
  extra?: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    ...extra,
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    opacity: spec.opacity ?? 1,
    transparent: spec.transparent ?? false,
    // Defaults to three's 1 when a spec does not care. Concrete asks for much
    // less than steel does, and that gap is what separates the two under a
    // single sun.
    envMapIntensity: spec.envMapIntensity ?? 1,
  })
}

let materialCache:
  | (Record<
      'structure' | 'slab' | 'fascia' | 'glass' | 'support' | 'helipad' | 'crown',
      THREE.MeshStandardMaterial
    > & { crownLight: THREE.MeshBasicMaterial })
  | null = null

/**
 * The crown beacons, off and on.
 *
 * Unlit and untone-mapped, the same answer the city's street lamps reached and
 * for the same reason: a lit fitting does not take shading from the sun, and
 * an unlit one is a different COLOUR rather than a darker version of the lit
 * one. Lerping between the two is why this is one shared material rather than
 * an on/off swap.
 */
const CROWN_LIGHT_OFF = new THREE.Color('#8a8f96')
const CROWN_LIGHT_ON = new THREE.Color('#ffe3b0')

/**
 * The brightest the hero's night channel ever gets, read from the presets.
 *
 * `glassGlow` is an emissive intensity, not a 0-to-1 dimmer, so it has to be
 * normalised before it can drive a colour lerp. Derived rather than written
 * down, so retuning the night keys cannot leave the beacons stuck part-lit.
 */
const PEAK_GLASS_GLOW = Math.max(...timeOfDayConfig.keys.map((k) => k.hero.glassGlow))

export function sharedMaterials() {
  if (!materialCache) {
    // Per-floor occupancy tone rides on the glazing geometry's own colour
    // attribute, so this material must read it. It tints the glass itself now
    // rather than a glow behind it: the emissive layer went with night mode,
    // but the floor-to-floor variation is what keeps the tower from reading as
    // one extruded ribbon, so the attribute stays.
    const glass = makeStandard(materialsConfig.glass, {
      vertexColors: true,
      // Lit rooms ride on their own map, keyed to the curtain-wall UVs the
      // glazing now carries. Its black texels emit nothing, which is what
      // keeps the tower a building rather than a lit slab.
      emissiveMap: heroGlassNightTexture(),
    })
    // Both faces, because the glazing is an open three-sided prism: the plate
    // caps it from above, but a culled backface would leave a hole straight
    // through the building at any angle that catches the far pane.
    //
    // Depth writes stay ON now that the panes are opaque. They were disabled
    // for transparency sorting, and leaving them off would stop the glass
    // occluding anything behind it — which is the entire point of it being
    // solid.
    glass.side = THREE.DoubleSide
    // Both faces, for the glazing's reason: the spire is an open three-sided
    // prism too, so a culled backface would leave a hole straight through the
    // crown at any angle that catches an open corner.
    // Metalness is the one number NOT taken from the spec, and it cannot be.
    // A metal has no body colour, only what it reflects — which is right for
    // the panes below, because they stand vertical and mirror the sky and the
    // city, and that is where their blue comes from. The spire's faces lean
    // steeply outward, so from any camera under them they mirror the GROUND
    // instead and render plain black beside blue floors. Matching the spec
    // exactly was tried and is what produced that. Dropping the metal lets the
    // glass's own tone carry the colour, so the crown reads as the same glass
    // from every angle rather than only on paper.
    const crownGlass = makeStandard({ ...materialsConfig.glass, metalness: 0.4 })
    crownGlass.side = THREE.DoubleSide
    // Its own window map, on the same curtain-wall coordinates as the floors
    // and drawn from the same wall tone and the same pair of lamp colours —
    // but far sparser. What makes a crown read as a crown is that FEW of its
    // panes are lit, not that all of them are lit faintly: the floors' own map
    // put a scatter of lit offices up a spire nobody works in, and simply
    // dimming that map lifts the wall between the windows by just as much and
    // gives back an evenly glowing lid.
    crownGlass.emissiveMap = heroCrownNightTexture()
    materialCache = {
      structure: makeStandard(materialsConfig.structure),
      slab: makeStandard(materialsConfig.slab, {
        map: heroConcreteTexture(),
        // Baked soffit and edge shading rides on the geometry's own colour
        // attribute. Nothing else in the hero uses this material, which is
        // what makes turning it on safe: any other geometry sharing it would
        // need a colour attribute of its own or would render black.
        vertexColors: true,
      }),
      fascia: makeStandard(materialsConfig.fascia),
      glass,
      support: makeStandard(materialsConfig.support),
      helipad: makeStandard(materialsConfig.helipad),
      // The facade's own glazing, tone for tone — see `crownGlass` above. A
      // separate MATERIAL rather than the same object, because the glazing's
      // has `vertexColors` on and carries a lit-window map keyed to
      // curtain-wall UVs; the spire has neither attribute, and sharing the
      // object would render it black and stripe it with windows after dark.
      crown: crownGlass,
      crownLight: new THREE.MeshBasicMaterial({ color: CROWN_LIGHT_OFF, toneMapped: false }),
    }
  }
  return materialCache
}

/**
 * How lit the tower itself is. Continuous, for the same reason the city's is.
 */
export interface HeroGlowLevels {
  plateGlow: number
  glassGlow: number
}

/**
 * Push one hour's artificial light onto the tower's shared materials.
 *
 * Builds the cache if it does not exist yet rather than bailing out. The caller
 * can run before the R3F subtree has mounted and asked for these materials, and
 * an early return there left the tower unlit for the whole session with nothing
 * to re-trigger it.
 */
export function applyHeroTimeOfDay(levels: HeroGlowLevels): void {
  const materials = sharedMaterials()
  const warm = materialsConfig.heroNightGlow
  for (const key of ['slab', 'fascia'] as const) {
    materials[key].emissive.set(warm)
    materials[key].emissiveIntensity = levels.plateGlow
  }
  // The frame stays dimmer than the plates it carries, so the floor rhythm —
  // one plate per day — is still what you read the tower by.
  for (const key of ['structure', 'support', 'helipad'] as const) {
    materials[key].emissive.set(warm)
    materials[key].emissiveIntensity = levels.plateGlow * 0.45
  }
  // Glazing gets its own, stronger: after dark an office reads by its windows.
  // White, because the colour of a lit room now lives in the map — some floors
  // are tungsten and some are fluorescent, and a single emissive colour here
  // would flatten all of them to one temperature. Every material in this cache
  // must be written here: one left out simply stays dark at night, and nothing
  // else would catch it.
  materials.glass.emissive.set('#ffffff')
  materials.glass.emissiveIntensity = levels.glassGlow
  // The crown is glazing, so it takes the glazing's light rather than the
  // frame's warm one — but at the facade's UNLIT tone and with no map, which
  // is exactly what a pane between two windows renders as. Same glass, same
  // colour, nobody home.
  // Through its own sparse map, so the wall between its windows lands on the
  // facade's unlit tone and only the few lit panes rise above it.
  materials.crown.emissive.set('#ffffff')
  materials.crown.emissiveIntensity = levels.glassGlow
  // The beacons on it, which are lamps rather than rooms: a colour lerp, not
  // an emissive, so they read as fittings that are on rather than as glass
  // that is glowing.
  materials.crownLight.color.lerpColors(
    CROWN_LIGHT_OFF,
    CROWN_LIGHT_ON,
    Math.min(1, levels.glassGlow / PEAK_GLASS_GLOW),
  )
}

/** Meal keys of `materialsConfig.mealTint`. */
export type MealTintKey = keyof typeof materialsConfig.mealTint

let tintCache: Record<MealTintKey, THREE.Color> | null = null

/**
 * Per-meal `instanceColor` multipliers for the data pillars.
 *
 * `instanceColor` multiplies the material's base colour in the shader, so the
 * stored value has to be the *ratio* between the meal's target tone and the
 * shared concrete tone — not the target itself, which would apply the concrete
 * colour twice and darken every pillar. The ratios land near white by design:
 * this is a nudge that tells the three meals apart on close inspection, not a
 * recolouring. Height stays the only thing that encodes a rating.
 *
 * Both colours are converted to linear on construction, and the shader
 * multiplies in linear, so dividing here reproduces the target exactly.
 */
export function mealTints(): Record<MealTintKey, THREE.Color> {
  if (!tintCache) {
    const base = new THREE.Color(materialsConfig.structure.color)
    const ratio = (hex: string) => {
      const target = new THREE.Color(hex)
      return new THREE.Color(target.r / base.r, target.g / base.g, target.b / base.b)
    }
    tintCache = {
      Breakfast: ratio(materialsConfig.mealTint.Breakfast),
      Lunch: ratio(materialsConfig.mealTint.Lunch),
      Dinner: ratio(materialsConfig.mealTint.Dinner),
    }
  }
  return tintCache
}

/**
 * Unit column: a cylinder of diameter 1 and height 1, base at y=0.
 *
 * The columns were square prisms with a chamfer at each arris and a recessed
 * flute down every face — five planes per face, so they read as structure
 * rather than as bars. A cylinder needs none of that: its silhouette curves
 * and its shading grades continuously, so it reads as round from any angle
 * without a single articulating cut.
 *
 * Everything still lives in the cross-section and nothing along the extrusion
 * axis. That is the design constraint that has not changed: this geometry is
 * shared by every pillar in the tower and Y-scaled per instance to that meal's
 * rating, so any feature with vertical extent would stretch by a different
 * amount on every column.
 */
function columnCylinder(segments: number): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(3, segments))
  geom.translate(0, 0.5, 0) // seat the base on y = 0, as the animator expects
  return geom
}

/**
 * Unit-diameter disc of height `h`, centred at `y`. Collars are built of these.
 *
 * `open` drops both end caps. A capped disc costs as many triangles again as
 * its wall, and in a stacked collar most of those caps are pressed against the
 * next disc where nothing can see them — three capped discs made the joint
 * head five times the price of the box it replaced, which on three columns of
 * every floor is what put the tower over its triangle budget.
 */
function disc(diameter: number, h: number, y: number, open = false): THREE.BufferGeometry {
  const r = diameter / 2
  const geom = new THREE.CylinderGeometry(r, r, h, buildingConfig.pillarSegments, 1, open)
  geom.translate(0, y, 0)
  return geom
}

/**
 * Unit fascia section: a 1×1 profile extruded along z, centred on all three
 * axes.
 *
 * Centred rather than base-seated because the fascia registers with
 * `grows: false` and its transform puts the instance at the edge midpoint with
 * `scale.z` as the edge length — the opposite convention to the columns, and
 * matching what the unit box it replaces already did.
 *
 * The section is drawn looking down the beam: +y is up the slab plane, +x is
 * outward from the building. The shadow gap is cut into the top-outer arris
 * and the drip notch into the bottom-outer one, so both catch a line of shade
 * from a sun that is above and to one side.
 */
function fasciaProfile(reveal: number, drip: number): THREE.BufferGeometry {
  const h = 0.5
  const r = Math.min(reveal, 0.45)
  const d = Math.min(drip, 0.45)

  const shape = new THREE.Shape()
  // Inner face, flush against the slab edge, from bottom to top.
  shape.moveTo(-h, -h)
  shape.lineTo(-h, h)
  // Top: run out, then step down and back out to leave a shadow gap under the
  // plate rather than a flush joint.
  shape.lineTo(h - r * 0.9, h)
  shape.lineTo(h - r * 0.9, h - r * 0.5)
  shape.lineTo(h, h - r * 0.5)
  // Outer face down to the drip notch.
  shape.lineTo(h, -h + d * 0.55)
  shape.lineTo(h - d * 0.7, -h + d * 0.55)
  shape.lineTo(h - d * 0.7, -h)
  shape.closePath()

  const geom = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
  // Extrude runs 0→1 in z; recentre so the instance's midpoint position and
  // edge-length z-scale place the beam exactly along its edge.
  geom.translate(0, 0, -0.5)
  geom.computeVertexNormals()
  return geom
}

/**
 * Steel connection head where a column meets the plate: a narrower body
 * between two flange plates, centred on the contact point.
 *
 * Centred, not base-seated — this replaces a unit box whose transform already
 * puts half of it into the slab and half onto the column, and that placement
 * is what makes the joint read as a connection rather than as a hat.
 */
function jointHead(bodyInset: number, flange: number): THREE.BufferGeometry {
  const b = Math.min(Math.max(bodyInset, 0.2), 0.95)
  const f = Math.min(Math.max(flange, 0.05), 0.4)
  const bodyH = 1 - f * 2
  // Round, because the column it caps is round: a square collar on a cylinder
  // reads as a mistake rather than as a detail at every angle but head-on.
  // Two pieces, not three. The upper flange sat inside the plate the head
  // bolts to, so it was never visible from anywhere and cost as much as the
  // flange that is — on three columns of every floor.
  return mergeGeometries([
    disc(1, f, -0.5 + f / 2),
    disc(b, bodyH + f, f / 2, true), // buried between the flange and the plate
  ])!
}

/** Stepped plate under a column: a wide foot with a narrower riser. */
function basePlate(stepInset: number): THREE.BufferGeometry {
  const s = Math.min(Math.max(stepInset, 0.2), 0.95)
  // Every face here is hidden: the foot sits on the plate below with the riser
  // covering it, and the riser has the column standing on top of it.
  return mergeGeometries([disc(1, 0.55, -0.225, true), disc(s, 0.45, 0.275, true)])!
}

let pillarGeom: THREE.BufferGeometry | null = null
let fasciaGeom: THREE.BufferGeometry | null = null
let jointGeom: THREE.BufferGeometry | null = null
let basePlateGeom: THREE.BufferGeometry | null = null

/** Shared steel joint head (scaled per instance to the capital block). */
export function jointHeadGeometry(): THREE.BufferGeometry {
  jointGeom ??= jointHead(buildingConfig.jointBodyInset, buildingConfig.jointFlangeHeight)
  return jointGeom
}

/** Shared stepped column base plate. */
export function basePlateGeometry(): THREE.BufferGeometry {
  basePlateGeom ??= basePlate(buildingConfig.basePlateStepInset)
  return basePlateGeom
}
let boxGeom: THREE.BufferGeometry | null = null

/** Shared profiled edge beam (scaled per instance to section × edge length). */
export function fasciaProfileGeometry(): THREE.BufferGeometry {
  fasciaGeom ??= fasciaProfile(buildingConfig.fasciaRevealDepth, buildingConfig.fasciaDripDepth)
  return fasciaGeom
}

/**
 * Shared pillar/support geometry (scaled per instance to width × height).
 *
 * Supports use this too. Their cross-section is the same as a data column's by
 * rule, and the "no review here" signal is carried entirely by the dark steel
 * material — a differently-shaped support would read as a different structural
 * member rather than as an absent measurement.
 */
export function pillarGeometry(): THREE.BufferGeometry {
  pillarGeom ??= columnCylinder(buildingConfig.pillarSegments)
  return pillarGeom
}

/**
 * Which shared geometry each instanced hero layer draws.
 *
 * One place, read by both the scene and the triangle budget. Without it the
 * two can disagree silently: the budget was measuring the joint head while the
 * scene was free to render a plain box, and the test would have gone on
 * reporting the more expensive figure without complaint.
 *
 * This does not make the two impossible to diverge — nothing forces the scene
 * through this map, and no test renders the component tree — but it removes
 * the duplication that made divergence the default.
 */
export const heroLayerGeometry = Object.freeze({
  pillars: pillarGeometry,
  supports: pillarGeometry,
  deckNodes: basePlateGeometry,
  fascias: fasciaProfileGeometry,
  capitals: jointHeadGeometry,
  soffitRibs: unitBoxGeometry,
  mullionFins: unitBoxGeometry,
})

/** Shared unit cube for deck beams and corner nodes. */
export function unitBoxGeometry(): THREE.BufferGeometry {
  boxGeom ??= new THREE.BoxGeometry(1, 1, 1)
  return boxGeom
}

/**
 * Unit-height triangular prism matching the footprint scaled by `factor`
 * about the centroid. Base at y=0; scale.y sets the height per instance.
 */
function footprintPrism(factor: number): THREE.BufferGeometry {
  const corners = footprintCorners().map((p) => ({ x: p.x * factor, y: 0, z: p.z * factor }))
  // Rounded with the same helper and the same radius as the plates, scaled
  // with the footprint: the podium shares the tower's outline, so a sharp
  // corner on it would put a knife edge back into a silhouette the plates have
  // already rounded off.
  const outline = plateOutline(
    corners as [(typeof corners)[0], (typeof corners)[0], (typeof corners)[0]],
    buildingConfig.plateEdgeRadius * factor,
    buildingConfig.plateCornerSegments,
  )
  const shape = new THREE.Shape()
  // Shape lives in the XY plane; after rotateX(-90°) shape-Y maps to -z, so
  // feed -z to keep the footprint orientation intact.
  shape.moveTo(outline[0].x, -outline[0].z)
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i].x, -outline[i].z)
  shape.closePath()
  const geom = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
  geom.rotateX(-Math.PI / 2)
  geom.computeVertexNormals()
  return geom
}

let litCache: Record<
  | 'hover'
  | 'selected'
  | 'hoverPlate'
  | 'selectedPlate'
  | 'hoverThrough'
  | 'selectedThrough',
  THREE.MeshStandardMaterial
> | null = null

let accentCache: { hover: THREE.MeshStandardMaterial; selected: THREE.MeshStandardMaterial } | null = null

/** Translucent emissive overlays for hover/selection (plan §26) — geometry is never mutated. */
export function accentMaterials() {
  if (!accentCache) {
    const make = (intensity: number) => {
      const m = new THREE.MeshStandardMaterial({
        color: materialsConfig.accentEmissive,
        emissive: materialsConfig.accentEmissive,
        emissiveIntensity: intensity,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
      return m
    }
    accentCache = {
      hover: make(materialsConfig.hoverEmissiveIntensity),
      selected: make(materialsConfig.selectedEmissiveIntensity),
    }
  }
  return accentCache
}

let helipadGeom: THREE.BufferGeometry | null = null

/**
 * Rooftop helipad marking: a painted ring with an H inside it.
 *
 * Built at world size rather than as a unit shape scaled per instance, because
 * there is exactly one of these in the building and a uniform scale would make
 * the ring's width and the letter's stroke track its diameter — which is not
 * how a painted marking works.
 *
 * The ring is a flat annulus and the letter three thin bars, all merged into
 * one buffer so the roof costs one draw call rather than four.
 */
export function helipadGeometry(): THREE.BufferGeometry {
  if (!helipadGeom) {
    const h = buildingConfig.helipad
    const ring = new THREE.RingGeometry(h.radius - h.ringWidth, h.radius, h.ringSegments)
    ring.rotateX(-Math.PI / 2)
    const bar = (w: number, d: number, x: number) => {
      const g = new THREE.BoxGeometry(w, h.markThickness, d)
      g.translate(x, 0, 0)
      return g
    }
    helipadGeom = mergeGeometries([
      ring,
      bar(h.barWidth, h.letterHeight, -h.letterWidth / 2),
      bar(h.barWidth, h.letterHeight, h.letterWidth / 2),
      bar(h.letterWidth, h.barWidth, 0),
    ])!
  }
  return helipadGeom
}

/**
 * Materials for the storey under the cursor: its lights, on.
 *
 * Nearly opaque and emissive, so the shell reads as lit glass rather than as a
 * tint laid over dark glass — at lower opacity the smoked pane behind it still
 * dominates and the floor just looks slightly warmer, which is the effect this
 * replaced. Depth writes stay off so the shell never occludes the structure in
 * front of it, and both faces draw because the glazing it covers does.
 */
export function litMaterials() {
  if (!litCache) {
    /**
     * Three variants, because the three things that light up sit in three
     * different relationships to the geometry around them.
     *
     * `through` drops the depth test, and exactly ONE thing wants it: the
     * single column being pointed at. The glazing is opaque and flush with the
     * plate edge, so a column is exposed at the triangle's corners and buried
     * behind glass along every elevation — a highlight that stops at the glass
     * shows a third of the member and reads as a rendering fault.
     *
     * `plate` is depth-tested but biased forward, because a plate shell is the
     * plate's own surface and would otherwise fight with it.
     *
     * `plain` is neither, and is what everything else takes. Nothing but the
     * one picked column should be visible through the building: a plate drawn
     * through the storeys in front of it floats free of the tower, and a whole
     * month of columns drawn that way is an x-ray of a building nobody asked
     * to see inside.
     */
    const make = (intensity: number, kind: 'plain' | 'plate' | 'through') => {
      const m = new THREE.MeshStandardMaterial({
        color: materialsConfig.litInterior,
        emissive: materialsConfig.litInterior,
        emissiveIntensity: intensity,
        roughness: 0.35,
        metalness: 0,
        // The see-through variant is OPAQUE, and has to be. A transparent
        // material lands in three's transparent pass, which draws after every
        // opaque object — so nothing opaque can be drawn back over it, and the
        // one thing that must be is the plates. See `PlateOccluders`.
        transparent: kind !== 'through',
        opacity: 0.92,
        depthWrite: false,
        // Only the plate variant is biased, and only the plate variant needs
        // to be: it IS the plate's own geometry lifted a fraction, and a
        // fraction is nothing here — depth resolves about half a unit to a
        // unit at the distances this scene is viewed from, so the two flicker
        // against each other in black patches as the camera moves. Kept as
        // small as does the job. A bias handed to every shell pushes the
        // columns forward too, and a lit column that pokes through the glass
        // in front of it is the see-through treatment arriving where it was
        // not asked for.
        polygonOffset: kind === 'plate',
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
        depthTest: kind !== 'through',
      })
      m.side = THREE.DoubleSide
      return m
    }
    litCache = {
      hover: make(materialsConfig.hoverLitIntensity, 'plain'),
      selected: make(materialsConfig.selectedLitIntensity, 'plain'),
      hoverPlate: make(materialsConfig.hoverLitIntensity, 'plate'),
      selectedPlate: make(materialsConfig.selectedLitIntensity, 'plate'),
      hoverThrough: make(materialsConfig.hoverLitIntensity, 'through'),
      selectedThrough: make(materialsConfig.selectedLitIntensity, 'through'),
    }
  }
  return litCache
}

let crownGeom: THREE.BufferGeometry | null = null
let crownRibGeom: THREE.BufferGeometry | null = null
let crownMullionGeom: THREE.BufferGeometry | null = null

/** The three column centrelines, measured from the middle of the plan. */
function crownFeet(): { x: number; z: number }[] {
  const corners = footprintCorners()
  const cx = corners.reduce((t, p) => t + p.x, 0) / 3
  const cz = corners.reduce((t, p) => t + p.z, 0) / 3
  return corners.map((p) => ({ x: p.x - cx, z: p.z - cz }))
}

/**
 * The spire's base: the plate's own outline.
 *
 * Not a triangle. The plate is a triangle with its corners wrapped round each
 * column on an arc, and the spire has to be the same shape or it cannot be
 * flush with it — a sharp corner where two flush faces meet lands twice the
 * overhang out from the column centre, which is outside the plate's arc, and
 * the arris then hangs over thin air. That is exactly what it did.
 *
 * Returned about the origin, not in footprint coordinates. The mesh is placed
 * AT the roof's centre, so a plan carrying its own offset would be applied
 * twice and the spire would sit off the building.
 */
function crownBase(): { x: number; z: number }[] {
  const feet = crownFeet().map((p) => ({ x: p.x, y: 0, z: p.z })) as [Vec3, Vec3, Vec3]
  return plateOutline(feet, slabOverhang(), buildingConfig.plateCornerSegments).map((p) => ({
    x: p.x,
    z: p.z,
  }))
}

/** Points per corner in the outline `crownBase` returns. */
const CROWN_ARC_STEPS = () => buildingConfig.plateCornerSegments + 1

/**
 * The three straight faces of the spire, as the base run each one springs
 * from: the outline between the end of one corner's arc and the start of the
 * next. These are the walls; the arcs between them are the arrises.
 */
function crownFaces(base: { x: number; z: number }[]) {
  const per = CROWN_ARC_STEPS()
  return [0, 1, 2].map((i) => ({
    from: base[i * per + per - 1],
    to: base[((i + 1) % 3) * per],
  }))
}

export interface CrownRing {
  y: number
  /** How much of the base plan this ring is, 1 at the plate and 0 at the top. */
  scale: number
}

/**
 * The spire's silhouette, as rings from the plate to the top.
 *
 * Straight for most of its rise and then a circular fillet into a dome. A
 * TANGENT fillet, worked out rather than eyeballed: the arc's centre sits on
 * the axis at the distance from the sloping side that makes the two meet
 * without a crease, so the faces run dead straight and the tip finishes
 * smoothly instead of ending in a pin.
 *
 * The plan is a rounded triangle, not a circle, so one radius cannot be exact
 * in every direction at once; the fillet is struck against the plan's mean
 * reach and applied as a uniform scale. What that costs is that the corners
 * round very slightly harder than the faces, which is what a real fillet on a
 * triangular plan does anyway.
 *
 * Everything the crown is made of rides on this one profile — glazing, ribs
 * and fins alike — because they all scale about the same axis toward the same
 * apex. That is what keeps them fitting each other as they rise.
 */
export function crownProfile(): CrownRing[] {
  const c = buildingConfig.crown
  const base = crownBase()
  const reach = base.reduce((t, p) => t + Math.hypot(p.x, p.z), 0) / base.length
  const height = c.height
  const slant = Math.hypot(height, reach)
  // Centre of the fillet: on the axis, one radius clear of the sloping side.
  const centreY = height - (c.tipRadius * slant) / reach
  // Where that circle touches the side — the foot of the perpendicular from
  // the centre onto the generator running from the plate to the apex.
  const touch = (reach * reach + centreY * height) / (slant * slant)

  if (!(centreY > 0) || !(touch > 0) || !(touch < 1)) {
    // A radius too big for the spire to carry. Fall back to the plain point
    // rather than emitting a folded-back silhouette.
    return [
      { y: 0, scale: 1 },
      { y: height, scale: 0 },
    ]
  }

  const rings: CrownRing[] = [
    { y: 0, scale: 1 },
    { y: touch * height, scale: 1 - touch },
  ]
  const start = Math.atan2(touch * height - centreY, (1 - touch) * reach)
  for (let i = 1; i <= c.capSegments; i++) {
    const angle = start + ((Math.PI / 2 - start) * i) / c.capSegments
    rings.push({
      y: centreY + c.tipRadius * Math.sin(angle),
      scale: (c.tipRadius * Math.cos(angle)) / reach,
    })
  }
  return rings
}

/**
 * Loft a plan outline up the crown's profile.
 *
 * One strip of quads per ring gap, wound outward. `outwardFrom` is the point
 * in plan the section surrounds — the axis for the glazing, a column
 * centreline for a rib — and is only ever used to decide which way round a
 * quad goes; the shrink itself is always about the origin, because every part
 * of the crown converges on the same apex and scaling them together is what
 * keeps a rib filling the opening it stands in at every height.
 */
function loftCrown(
  points: { x: number; z: number }[],
  closed: boolean,
  outwardFrom: { x: number; z: number },
  /**
   * Where each point sits across its elevation, 0 to 1. Supplied only for the
   * glazing, which needs curtain-wall coordinates to carry a window map; the
   * concrete and steel of the crown have no use for them.
   */
  us?: [number, number],
): { positions: number[]; uvs: number[] } {
  const rings = crownProfile()
  const positions: number[] = []
  const uvs: number[] = []
  const last = closed ? points.length : points.length - 1
  // One row of the map per storey, exactly as the facade does — so the crown
  // goes on counting floors of windows instead of stretching one over itself.
  const vAt = (ring: CrownRing) => ring.y / (moduleHeight() * GLASS_TILE_FLOORS)
  /**
   * `u` shrunk about the middle of the face by the same factor the plan is.
   *
   * Which makes it constant in WORLD width: the run is `W * scale` wide at a
   * given ring and spans `scale` of the map, so every texture column keeps the
   * same width in metres however high up it is. That is what makes a window a
   * rectangle here. Carrying `u` from 0 to 1 at every ring instead — the
   * obvious mapping, and the one that was here — stretches each column to fit
   * a narrowing face, so the cells shear with the slope and the crown ends up
   * lit by a grid of leaning parallelograms while the floors below it are
   * upright.
   */
  const uAt = (u: number, ring: CrownRing) => 0.5 + (u - 0.5) * ring.scale

  for (let r = 0; r < rings.length - 1; r++) {
    const lo = rings[r]
    const hi = rings[r + 1]
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % points.length
      const a = points[i]
      const b = points[j]
      const at = (p: { x: number; z: number }, ring: CrownRing) =>
        [p.x * ring.scale, ring.y, p.z * ring.scale] as const
      // Which winding faces away from the section's own centre.
      const mid = { x: (a.x + b.x) / 2 - outwardFrom.x, z: (a.z + b.z) / 2 - outwardFrom.z }
      const nx = -(b.z - a.z)
      const nz = b.x - a.x
      const forward = nx * mid.x + nz * mid.z > 0
      const [p, q] = forward ? [a, b] : [b, a]
      const [up, uq] = us ? (forward ? us : [us[1], us[0]]) : [0, 0]

      if (hi.scale <= 0) {
        positions.push(...at(p, lo), ...at(q, lo), 0, hi.y, 0)
        uvs.push(uAt(up, lo), vAt(lo), uAt(uq, lo), vAt(lo), 0.5, vAt(hi))
        continue
      }
      positions.push(...at(p, lo), ...at(q, lo), ...at(q, hi))
      uvs.push(uAt(up, lo), vAt(lo), uAt(uq, lo), vAt(lo), uAt(uq, hi), vAt(hi))
      positions.push(...at(p, lo), ...at(q, hi), ...at(p, hi))
      uvs.push(uAt(up, lo), vAt(lo), uAt(uq, hi), vAt(hi), uAt(up, hi), vAt(hi))
    }
  }
  return { positions, uvs }
}

/** Outward unit normal of the sloped face rising from `from`→`to` to the apex. */
function faceBasis(from: { x: number; z: number }, to: { x: number; z: number }, height: number) {
  const edge = new THREE.Vector3(to.x - from.x, 0, to.z - from.z)
  const rise = new THREE.Vector3(-from.x, height, -from.z)
  const normal = edge.clone().cross(rise).normalize()
  const mid = new THREE.Vector3((from.x + to.x) / 2, 0, (from.z + to.z) / 2)
  return normal.dot(mid) < 0 ? normal.negate() : normal
}

/**
 * The spire's glazing: the three elevations, lofted to a point.
 *
 * Three faces and nothing else — the corners are left UNGLAZED, which is the
 * rule the facade below already follows: the plate wraps each column on an arc
 * and the glass stops either side of it, so the three columns stay visible up
 * the whole height of the building. The crown now says the same thing. It also
 * removes the only place the glass and the ribs could meet, and they were
 * meeting badly: a rib is a member of fixed section and the glass tapers to a
 * point, so past about a third of the way up the rib was through it.
 *
 * Open at the bottom too: the base stands on the plate, so a cap there is
 * geometry nobody can ever see. Non-indexed and left to `computeVertexNormals`
 * so each face gets one flat normal and catches the sun separately.
 */
export function crownGeometry(): THREE.BufferGeometry {
  if (!crownGeom) {
    const positions: number[] = []
    const uvs: number[] = []
    for (const { from, to } of crownFaces(crownBase())) {
      // Zero to one across each elevation, which is the facade's own reference
      // run: one face of the crown shows the map's full bay count, exactly as
      // one storey below it does.
      const face = loftCrown([from, to], false, { x: 0, z: 0 }, [0, 1])
      positions.push(...face.positions)
      uvs.push(...face.uvs)
    }
    crownGeom = new THREE.BufferGeometry()
    crownGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    // Not decoration: without these the window map has nowhere to land, and
    // the crown goes back to being one flat dark triangle over a facade full
    // of lit offices.
    crownGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    crownGeom.computeVertexNormals()
  }
  return crownGeom
}

/**
 * The three columns, leaning in to the point.
 *
 * An OBLIQUE cone per column: a horizontal circle of `slabOverhang` about the
 * column centreline, lofted straight to the apex. That circle is the plate's
 * own corner arc, so the rib is seated exactly on the slab — it neither
 * oversails the edge nor stands back from it — and because the loft is to the
 * same apex as the glazing, its horizontal section at every height is exactly
 * the arc the glazing leaves open at that height. It fills the opening the
 * whole way up and touches the two glass runs precisely at their ends.
 *
 * Which is the point. A right cone on the same axis cannot do this: its
 * sections are perpendicular to a LEANING axis, so it reads as an ellipse in
 * plan and fits the opening at one height and no other. A parallel shaft is
 * worse again — narrower than the opening at the bottom, wider at the top, so
 * it left gaps down low and broke out through the glass higher up.
 */
let crownRibParts: THREE.BufferGeometry[] | null = null

/**
 * One rib, by corner — same order as `CORNER_MEALS`, because a rib stands over
 * exactly one column and that column is one meal.
 *
 * Kept separately as well as merged: the merged buffer is what draws, and a
 * single rib is what lights up when its own meal is pointed at.
 */
export function crownRibPart(corner: 0 | 1 | 2): THREE.BufferGeometry {
  if (!crownRibParts) {
    const segments = Math.max(3, buildingConfig.pillarSegments)
    const radius = slabOverhang()
    crownRibParts = crownFeet().map((foot) => {
      const circle = [...Array(segments).keys()].map((i) => {
        const a = (i / segments) * Math.PI * 2
        return { x: foot.x + Math.cos(a) * radius, z: foot.z + Math.sin(a) * radius }
      })
      const geom = new THREE.BufferGeometry()
      geom.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(loftCrown(circle, true, foot).positions, 3),
      )
      geom.computeVertexNormals()
      return geom
    })
  }
  return crownRibParts[corner]
}

export function crownRibGeometry(): THREE.BufferGeometry {
  if (!crownRibGeom) {
    const parts = [0, 1, 2].map((i) => {
      const part = crownRibPart(i as 0 | 1 | 2).clone()
      // Which meal's column this rib continues, carried per vertex so a ray
      // hitting the merged buffer can be resolved back to one of them without
      // splitting the mesh into three draw calls.
      const count = part.getAttribute('position').count
      part.setAttribute('corner', new THREE.Float32BufferAttribute(new Float32Array(count).fill(i), 1))
      return part
    })
    crownRibGeom = mergeGeometries(parts)!
    for (const part of parts) part.dispose()
  }
  return crownRibGeom
}

/**
 * Mullion fins up the spire's glazing, at the facade's own spacing.
 *
 * The glass below is read by its fins — they are the vertical grain of the
 * whole tower — and a crown of plain sheet glass sits on top of it looking
 * like a different material. Same section, same spacing, same dark steel; they
 * simply converge as they rise, because the surface they are on does.
 */
export function crownMullionGeometry(): THREE.BufferGeometry {
  if (!crownMullionGeom) {
    const c = buildingConfig
    const rings = crownProfile()
    // The last ring of the straight run: the fillet begins above it.
    const straight = rings[1]
    const parts: THREE.BufferGeometry[] = []

    for (const { from, to } of crownFaces(crownBase())) {
      const normal = faceBasis(from, to, c.crown.height)
      const run = new THREE.Vector3(to.x - from.x, 0, to.z - from.z)
      // Divided rather than stepped along, so the spacing lands on a whole
      // number of bays and the two ends of a face are symmetrical.
      const bays = Math.max(1, Math.round(run.length() / c.mullionSpacing))

      for (let i = 1; i < bays; i++) {
        const foot = new THREE.Vector3(from.x, 0, from.z).addScaledVector(run, i / bays)
        // Stopped where the glass starts to curve. A straight fin carried on
        // past that would stand off the dome instead of lying on it, and a
        // mullion running out into the cap is not what a mullion does.
        const along = new THREE.Vector3(foot.x * straight.scale, straight.y, foot.z * straight.scale)
          .sub(foot)
        const up = along.clone().normalize()
        const across = up.clone().cross(normal).normalize()
        const fin = new THREE.BoxGeometry(c.mullionWidth, along.length(), c.mullionDepth)
        fin.applyMatrix4(
          new THREE.Matrix4().makeBasis(across, up, normal).setPosition(
            foot
              .clone()
              .addScaledVector(along, 0.5)
              .addScaledVector(normal, c.mullionDepth / 2),
          ),
        )
        parts.push(fin)
      }
    }

    crownMullionGeom = mergeGeometries(parts)!
    for (const part of parts) part.dispose()
  }
  return crownMullionGeom
}

let crownLightGeom: THREE.BufferGeometry | null = null

/**
 * Beacons up the spire's three arrises, and one on the point.
 *
 * A crown carries lights because it is the highest thing for miles, not
 * because anybody is working in it — so these are fittings on the structure,
 * spaced up the ribs, and NOT a lit-window map. That distinction is the whole
 * design of the crown after dark: the glass stays the tone of an unlit pane
 * and the light comes from a countable number of lamps.
 *
 * Placed on the rib centrelines by walking the same profile everything else in
 * the crown rides, so a beacon sits on its rib at every height rather than
 * drifting off it as the spire closes.
 */
export function crownLightGeometry(): THREE.BufferGeometry {
  if (!crownLightGeom) {
    const c = buildingConfig.crown
    const rings = crownProfile()
    const straight = rings[1]
    const top = rings[rings.length - 1]
    const parts: THREE.BufferGeometry[] = []

    const bulb = (x: number, y: number, z: number) => {
      const g = new THREE.SphereGeometry(c.lightRadius, 8, 6)
      g.translate(x, y, z)
      parts.push(g)
    }

    for (const t of c.lightStops) {
      const y = straight.y * t
      // On the straight run the plan closes linearly on the apex, so the rib's
      // centreline at height y is simply its foot scaled by what is left.
      const scale = 1 - y / c.height
      for (const foot of crownFeet()) bulb(foot.x * scale, y, foot.z * scale)
    }
    // The point itself, which is the one a pilot is actually looking for.
    bulb(0, top.y, 0)

    crownLightGeom = mergeGeometries(parts)!
    for (const part of parts) part.dispose()
  }
  return crownLightGeom
}

let podiumGeom: THREE.BufferGeometry | null = null

/** Ground-level plinth the tower rises from. */
export function podiumGeometry(): THREE.BufferGeometry {
  podiumGeom ??= footprintPrism(buildingConfig.podiumScale)
  return podiumGeom
}
