import * as THREE from 'three'
import { cityConfig } from '@/config'
import {
  disposeFacadeTextures,
  facadeNightTextures,
  facadeTextures,
} from './facadeTexture'
import { disposePropGeometry } from './propGeometry'
import { disposePedestrianGeometry } from './pedestrianGeometry'
import { disposeSignalGeometry } from './signalGeometry'
import { disposeVehicleGeometry } from './vehicleGeometry'
import type { FacadeFamily } from './buildingGeometry'

/**
 * Shared city materials and textures (plan §§28, 35, 47).
 *
 * Module-scoped and created once, mirroring `scene/resources.ts` for the
 * building. Everything allocated here is released by `disposeCityResources`,
 * which is the single teardown point for the environment's GPU memory.
 *
 * The palette is deliberately cooler and flatter than the building's: the
 * tower keeps the warmest, brightest surfaces so it stays the landmark
 * (plan §§4, 51). Nothing here competes for attention.
 */

export interface CityMaterials {
  skyline: THREE.MeshStandardMaterial
  roof: THREE.MeshStandardMaterial
  terrain: THREE.MeshStandardMaterial
  asphalt: THREE.MeshStandardMaterial
  marking: THREE.MeshStandardMaterial
  sidewalk: THREE.MeshStandardMaterial
  plaza: THREE.MeshStandardMaterial
  cover: THREE.MeshStandardMaterial
  attraction: THREE.MeshStandardMaterial
  bark: THREE.MeshStandardMaterial
  foliage: THREE.MeshStandardMaterial
  streetMetal: THREE.MeshStandardMaterial
  timber: THREE.MeshStandardMaterial
  vehicle: THREE.MeshStandardMaterial
  pedestrian: THREE.MeshStandardMaterial
  lamp: THREE.MeshBasicMaterial
  lampLens: THREE.MeshBasicMaterial
}

/** The far city's own faint glow after dark. */
// Warm-grey, not blue. The far skyline sits in front of the horizon's own
// skyglow, which is the city's light scattered back down; a cool silhouette
// against a warm band reads as blue cardboard rather than as distance.
const SKYLINE_GLOW = new THREE.Color('#43403f')
// Rebalanced when the facade map stopped being black between the windows:
// `windowGlow` came down from 1.0 to 0.55 to stop the whole wall glowing at
// full, and the skyline rides on that same number. Raising the share keeps
// the far silhouette exactly where it was — a shade above the sky behind it,
// which is all that stops the horizon reading as a hole.
const SKYLINE_GLOW_SHARE = 0.46

/**
 * A street lamp off is a different COLOUR, not a darker one — dead glass reads
 * cold and grey where a lit lens reads warm. Lerping between the two is why
 * this is one shared unlit material rather than an on/off swap.
 */
const LAMP_UNLIT = new THREE.Color('#7c8188')
// Near white, not amber. The lens is drawn unlit and untone-mapped, so its
// colour IS its output: at #ffd9a3 the brightest thing a street could produce
// was two thirds of white in green and blue, and a street of them read as a
// line of warm markers rather than as lighting. Kept off pure white so the
// lamps stay tungsten against the cool night wash.
const LAMP_LIT = new THREE.Color('#fff0d4')

/**
 * How lit the city is, as continuous levels rather than a whole hour.
 *
 * Narrow on purpose: the caller is mid-blend between two keyframes, so what
 * arrives here is an interpolated value that belongs to no authored hour.
 */
export interface CityGlowLevels {
  windowGlow: number
  lampGlow: number
}

/**
 * Push one hour's artificial light onto the city's shared materials.
 *
 * Called by the time-of-day driver through the registry, never from a React
 * effect keyed to the hour. A second writer keyed that way snaps the city to
 * the TARGET the instant a transition begins, so the cross-fade plays out on
 * the tower while the streets have already arrived.
 */
export function applyCityTimeOfDay(levels: CityGlowLevels): void {
  if (facadeCache) {
    for (const m of Object.values(facadeCache)) m.emissiveIntensity = levels.windowGlow
  }
  if (!materialCache) return
  // A fraction of the windows' level, not the same as it. The far silhouette
  // exists to read as DISTANCE; at full strength its self-lit tone lifts it
  // above the sky behind it and the horizon inverts — the furthest thing on
  // screen becomes the palest.
  materialCache.skyline.emissiveIntensity = levels.windowGlow * SKYLINE_GLOW_SHARE
  materialCache.lampLens.color.lerpColors(LAMP_UNLIT, LAMP_LIT, levels.lampGlow)
}

let materialCache: CityMaterials | null = null
let terrainTexture: THREE.CanvasTexture | null = null

/**
 * Radial ground wash: lit around the hero, falling away to the backdrop tone
 * at the rim. Without it the ground disc ends in a hard bright circle against
 * the sky, which reads as a stage rather than a city.
 */
function buildTerrainTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  // The lit zone has to span the whole street grid, not just the plaza: the
  // asphalt is dark, so where the ground also goes dark the roads stop
  // reading entirely. Falloff starts beyond the modelled blocks.
  g.addColorStop(0, '#565249')
  g.addColorStop(0.35, '#4b4740')
  g.addColorStop(0.62, '#35383e')
  g.addColorStop(1, '#171a1f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * Depth bias for the stacked ground layers.
 *
 * The ground is a stack of near-coplanar surfaces, and the tiny y offsets that
 * separate them are far below what the depth buffer can resolve at city
 * distances: with a 0.1 near plane, 24-bit depth resolves ~0.44 scene units at
 * 860 away and ~1.2 at the full-tower camera distance. Millimetre offsets lose
 * the depth test outright, which made the roads vanish into the terrain.
 *
 * `polygonOffset` biases in screen-space depth instead, so the ordering holds
 * at every zoom. Higher factor = pushed further back.
 */
/**
 * Depth bias for the city's ground layers. A LOWER factor draws nearer.
 *
 * Every one of these has to stay under the ISLAND terrain's own offset, which
 * is 3 — because with the island on, that is the surface the whole city is
 * drawn upon. The asphalt was at 4: pushed further back than the ground it
 * lies on, so the ground drew over the roads. That was invisible for as long
 * as the ground under the city was brown-grey and the asphalt nearly black,
 * and the moment the ground went green the roads went green with it.
 *
 * The order among themselves is unchanged — earth, then grass, then the
 * carriageway, then the kerbs, then the paint on top.
 */
const DEPTH_BIAS = Object.freeze({
  terrain: 2.6,
  /** Grass: on top of the earth, under everything anybody built. */
  cover: 2.2,
  asphalt: 1.7,
  raised: 0.9,
  markings: 0,
})

function biased(factor: number) {
  return factor === 0
    ? {}
    : { polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor * 2 }
}

export function cityMaterials(): CityMaterials {
  if (!materialCache) {
    terrainTexture = buildTerrainTexture()
    materialCache = {
      // Far silhouette. Deliberately flat and dark: it should read as depth,
      // never as detail competing with the district or the tower.
      skyline: new THREE.MeshStandardMaterial({
        color: '#2d323a',
        // The self-lit tone is fixed; `applyCityTimeOfDay` scales its intensity,
        // so the far city can be any fraction of lit rather than only fully on
        // or fully off. Without it the silhouette falls to a black band the
        // moment the sun leaves it, and reads as a hole in the horizon rather
        // than as distance.
        emissive: new THREE.Color(SKYLINE_GLOW),
        emissiveIntensity: 0,
        roughness: 1,
        metalness: 0,
      }),
      // Roof tone rides on vertex colour, so one material serves every block.
      roof: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
      }),
      terrain: new THREE.MeshStandardMaterial({
        map: terrainTexture,
        roughness: 1,
        metalness: 0,
        ...biased(DEPTH_BIAS.terrain),
      }),
      asphalt: new THREE.MeshStandardMaterial({
        color: '#1f2226',
        roughness: 0.92,
        metalness: 0,
        ...biased(DEPTH_BIAS.asphalt),
      }),
      marking: new THREE.MeshStandardMaterial({
        color: '#c9c4b4',
        roughness: 0.7,
        metalness: 0,
        ...biased(DEPTH_BIAS.markings),
      }),
      sidewalk: new THREE.MeshStandardMaterial({
        ...biased(DEPTH_BIAS.raised),
        color: '#6d6a64',
        roughness: 0.9,
        metalness: 0,
      }),
      // Slightly warmer and lighter than the sidewalks: the forecourt should
      // read as belonging to the tower.
      plaza: new THREE.MeshStandardMaterial({
        ...biased(DEPTH_BIAS.raised),
        color: '#847e74',
        roughness: 0.85,
        metalness: 0,
      }),
      // Grass. White base with the lawn/meadow/garden tint on vertex colours,
      // so three surfaces share one material and one draw call.
      cover: new THREE.MeshStandardMaterial({
        ...biased(DEPTH_BIAS.cover),
        color: '#ffffff',
        vertexColors: true,
        roughness: 1,
        metalness: 0,
      }),
      // Fairground paint and steel, both on vertex colours: the whole park is
      // one buffer, and a ride's colour is the only thing that varies.
      attraction: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.62,
        metalness: 0.1,
      }),
      bark: new THREE.MeshStandardMaterial({ color: '#4a3f36', roughness: 1, metalness: 0 }),
      // Per-tree tint rides on instanceColor, so the base has to be white or
      // it would multiply into every canopy twice.
      foliage: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }),
      streetMetal: new THREE.MeshStandardMaterial({
        color: '#3c4046',
        roughness: 0.62,
        metalness: 0.35,
      }),
      timber: new THREE.MeshStandardMaterial({ color: '#6b5540', roughness: 0.88, metalness: 0 }),
      // Bodywork tint arrives on instanceColor and the glazing on the
      // geometry's own vertex colours; the two multiply, so one material
      // paints the whole fleet.
      vehicle: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.2,
      }),
      // Same two-layer trick as the vehicles: dark legs in the geometry, the
      // per-person top colour on instanceColor.
      pedestrian: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.9,
        metalness: 0,
      }),
      // Lamps are unlit on purpose. A lit lens does not take shading from the
      // sun — that is the whole difference between a lamp and a coloured disc —
      // and an unlit aspect is a different colour, not a darker one, which is
      // why the on/off states are supplied per instance rather than dimmed.
      lamp: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      lampLens: new THREE.MeshBasicMaterial({ color: '#ffd9a3', toneMapped: false }),
      // Head and tail colours come from the geometry's vertex colours, so one
      // material lights both ends of every vehicle in the fleet.
    }
  }
  return materialCache
}



let skylineGeom: THREE.BufferGeometry | null = null

/**
 * Unit box with its base at y=0, so a per-instance y scale is the mass's
 * height and every silhouette stands on the ground rather than through it.
 */
export function skylineGeometry(): THREE.BufferGeometry {
  if (!skylineGeom) {
    skylineGeom = new THREE.BoxGeometry(1, 1, 1)
    skylineGeom.translate(0, 0.5, 0)
  }
  return skylineGeom
}

let facadeCache: Record<FacadeFamily, THREE.MeshStandardMaterial> | null = null

/**
 * One material per facade family. Per-building tint travels on vertex colours
 * rather than in the material, so a whole family stays a single draw call.
 */
export function cityFacadeMaterials(): Record<FacadeFamily, THREE.MeshStandardMaterial> {
  if (!facadeCache) {
    const textures = facadeTextures()
    const night = facadeNightTextures()
    const make = (family: FacadeFamily) =>
      new THREE.MeshStandardMaterial({
        map: textures.get(family),
        // Lit windows ride on their own map in the same tiling, so a lit pane
        // lands exactly on a window. Its black texels emit nothing, which is
        // what keeps the wall between them dark.
        //
        // Emissive is NOT multiplied by `vertexColors` — that only tints the
        // diffuse — so every building's windows glow the same warmth however
        // the block itself is tinted. That is a limitation worth knowing: the
        // variety has to come from the map, not from the instance.
        emissiveMap: night.get(family),
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0,
        vertexColors: true,
        roughness: 0.82,
        metalness: 0.05,
      })
    facadeCache = {
      office: make('office'),
      residential: make('residential'),
      masonry: make('masonry'),
    }
  }
  return facadeCache
}

/** Release every shared city resource. Safe to call when nothing was built. */
export function disposeCityResources(): void {
  if (materialCache) {
    for (const m of Object.values(materialCache)) m.dispose()
    materialCache = null
  }
  if (facadeCache) {
    for (const m of Object.values(facadeCache)) m.dispose()
    facadeCache = null
  }
  skylineGeom?.dispose()
  skylineGeom = null
  disposePropGeometry()
  disposeVehicleGeometry()
  disposePedestrianGeometry()
  disposeSignalGeometry()
  disposeFacadeTextures()
  terrainTexture?.dispose()
  terrainTexture = null
}

/** Y offsets keeping coplanar ground layers from z-fighting. */
/**
 * The island terrain's own depth bias, which every city ground layer must
 * stay in front of. Exported so a test can assert that rather than trusting
 * two numbers in different files to stay in step.
 */
export const CITY_GROUND_BIAS = DEPTH_BIAS

export const GROUND_LAYERS = Object.freeze({
  terrain: 0,
  /** East–west asphalt. */
  asphaltEw: 0.01,
  /** North–south asphalt, a hair above so junctions resolve cleanly. */
  asphaltNs: 0.012,
  markings: 0.024,
  /** Walkways and paving stand on the kerb upstand. */
  kerbTop: cityConfig.roads.curbHeight,
})
