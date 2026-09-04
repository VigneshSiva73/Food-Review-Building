import type * as THREE from 'three'
import type { BlendedPreset } from './blendPreset'

/**
 * Where the driver finds the things it has to write to.
 *
 * The alternative was passing lighting values down as React props, which is
 * what this replaces. Under a per-frame animation that fails in a specific
 * way: any commit touching those props re-renders the light with the *target*
 * values while the driver is still mid-sweep, so the scene flashes its
 * destination for a frame. Registering the objects instead leaves exactly one
 * writer, and nothing to race with.
 *
 * Module-scoped for the same reason the material caches are: these are shared
 * scene objects with one owner, not component state.
 */

export interface LightHandles {
  hemisphere: THREE.HemisphereLight
  caster: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  /** Content bounds, so the driver can place the caster from its angles. */
  boundingRadius: number
  totalHeight: number
}

export interface SceneHandles {
  scene: THREE.Scene
  /** The background colour the driver owns and mutates; never replaced. */
  background: THREE.Color
}

/**
 * How the visible dome takes an hour. Uniform writes only, so it runs on every
 * frame of a sweep and stays exactly in step with the light.
 */
export type SkyDomeApply = (blend: BlendedPreset) => void

/**
 * How the reflection probe rebuilds itself.
 *
 * `force` bypasses the rebuild's own throttle. The driver sets it for the final
 * frame of a sweep and for instant applies, so a settled scene can never be
 * left reflecting a sky one cadence step short of where it stopped.
 */
export type SkyRebuild = (blend: BlendedPreset, force: boolean) => void

let lights: LightHandles | null = null
let scene: SceneHandles | null = null
let skyDome: SkyDomeApply | null = null
let stars: SkyDomeApply | null = null
let clouds: SkyDomeApply | null = null
let sky: SkyRebuild | null = null

/**
 * Callback the driver installs so registrations arriving after it mounts — the
 * lights re-fitting to a new dataset, and in later phases the city switching
 * on — are brought up to the current hour rather than left at whatever they
 * were built with.
 */
let onRegister: (() => void) | null = null

function announce() {
  onRegister?.()
}

export function registerLights(handles: LightHandles): () => void {
  lights = handles
  announce()
  return () => {
    if (lights === handles) lights = null
  }
}

export function registerScene(handles: SceneHandles): () => void {
  scene = handles
  announce()
  return () => {
    if (scene === handles) scene = null
  }
}

export function registerSkyDome(apply: SkyDomeApply): () => void {
  skyDome = apply
  announce()
  return () => {
    if (skyDome === apply) skyDome = null
  }
}

export function registerStars(apply: SkyDomeApply): () => void {
  stars = apply
  announce()
  return () => {
    if (stars === apply) stars = null
  }
}

export function registerClouds(apply: SkyDomeApply): () => void {
  clouds = apply
  announce()
  return () => {
    if (clouds === apply) clouds = null
  }
}

export function registerSky(rebuild: SkyRebuild): () => void {
  sky = rebuild
  announce()
  return () => {
    if (sky === rebuild) sky = null
  }
}

/**
 * Tell the driver the city's shared materials now exist.
 *
 * They are built lazily on the city's first render, so they can appear
 * part-way through a sweep or long after one has settled. Nothing is stored —
 * the announcement alone is what makes the driver write the current hour onto
 * them.
 */
export function registerCityMaterials(): void {
  announce()
}

export function setRegistrationListener(fn: (() => void) | null): void {
  onRegister = fn
}

export const handles = {
  lights: () => lights,
  scene: () => scene,
  skyDome: () => skyDome,
  stars: () => stars,
  clouds: () => clouds,
  sky: () => sky,
}
