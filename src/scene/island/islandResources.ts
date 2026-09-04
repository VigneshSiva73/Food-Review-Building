import * as THREE from 'three'
import { DEEP_WATER } from './oceanMesh'
import { disposeWaterfallTexture, waterfallTexture } from './waterfallTexture'

/**
 * Shared island materials, module-scoped and built once.
 *
 * Same idiom as `cityResources`: one cache, one dispose, so a remount or a
 * toggle never leaks a material.
 *
 * Neither registers with the time-of-day registry. They are plain lit surfaces
 * — like `Ground.tsx`, which registers nothing — so the hour reaches them
 * through the lights and the environment probe that are already being written,
 * and there is no second writer to race with the driver mid-blend.
 */

/** Depth bias of the ground the city stands on. See the terrain material. */
export const ISLAND_TERRAIN_OFFSET = 3

export interface IslandMaterials {
  terrain: THREE.MeshStandardMaterial
  /** Graded sheet over the island, see-through where the water is shallow. */
  shallow: THREE.MeshStandardMaterial
  /** The horizon, opaque, underneath everything. */
  deep: THREE.MeshStandardMaterial
  /** Fresh water in the channels the drainage cut. */
  river: THREE.MeshStandardMaterial
  /** Falling water. Its map scrolls, which is the whole of the animation. */
  waterfall: THREE.MeshStandardMaterial
  /** The pool at the foot of a fall. */
  pool: THREE.MeshStandardMaterial
  /** Road surfaces, from dirt track to metalled trunk. */
  road: THREE.MeshStandardMaterial
  /** Footpaths: the same treatment, narrower and earthier. */
  trail: THREE.MeshStandardMaterial
}

let cache: IslandMaterials | null = null
export function islandMaterials(): IslandMaterials {
  if (!cache) {
    cache = {
      // Every ground tone is on vertex colours, so beach, grass and rock are
      // one draw call. Fully rough — the water does the reflecting.
      terrain: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        // Behind the city's own ground layers, which are drawn on top of it.
        // Kept small: the first attempt used a factor of 9, which at the far
        // planes an island needs was enough depth bias to push the whole
        // landmass behind the ocean plane and make it vanish.
        // The surface the whole city is drawn upon, so every city ground layer
        // has to sit in front of this. `cityGround.test.ts` pins that: the two
        // numbers live in different files and drifted apart once already,
        // which put the ground over the roads.
        polygonOffset: true,
        polygonOffsetFactor: ISLAND_TERRAIN_OFFSET,
        polygonOffsetUnits: ISLAND_TERRAIN_OFFSET * 2,
      }),
      // The shallows carry depth in their vertex colours AND their alpha, so
      // the sand keeps going under the water instead of stopping at the
      // waterline. Transparent from construction: flipping `transparent` at
      // runtime forces a shader recompile and a re-sort.
      shallow: new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        // Depth writes off, so the seabed drawn before it is not masked out.
        // The sheet is a single flat layer, so nothing of its own needs sorting.
        depthWrite: false,
        // Finished IDENTICALLY to the deep plane below. They were 0.16/0.06/1.4
        // against 0.14/0.08/1.5, which is invisible on either alone and shows
        // as a hard straight seam exactly where the graded sheet ends — the two
        // surfaces were catching the sky slightly differently.
        roughness: 0.14,
        metalness: 0.08,
        envMapIntensity: 1.5,
        // No ripple normal map. It was a 128-pixel tile of summed sines
        // repeated thirty-four times across the sheet, and at this scale a
        // tiled dimple pattern reads as a field of BUBBLES rather than as
        // water — a regular one, at that, since it repeated every 540 units.
        // The per-fragment chop in `oceanWaves.ts` does the same job properly:
        // finer, directional, tied to the same spectrum as the swell, and with
        // nothing to tile.
      }),
      // Low roughness and a strong probe are what carry the sky onto the water,
      // which is most of why water reads as water at all: at night it goes
      // near-black and picks up the moon.
      deep: new THREE.MeshStandardMaterial({
        color: DEEP_WATER,
        roughness: 0.14,
        metalness: 0.08,
        envMapIntensity: 1.5,
        // NO normal map out here, deliberately. The horizon plane is two
        // triangles spanning ninety thousand units, so a tiled map across it
        // gives the rasteriser derivatives that span most of the texture per
        // pixel — and no amount of mipmapping rescues that. It came out as a
        // hard diagonal moiré over the whole sea. Ripples belong on the
        // tessellated sheet near the island, where the geometry can carry them;
        // from this far out, open water is a flat sheen anyway.
      }),
      // The sheet is lit from both sides and never writes depth: it hangs on a
      // cliff face and would otherwise fight the rock behind it for millimetres.
      waterfall: new THREE.MeshStandardMaterial({
        map: waterfallTexture(),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        roughness: 0.24,
        metalness: 0,
        // Falling water is bright against a shaded cliff even at dusk, and a
        // small self-lit component is what keeps it reading as water rather
        // than as a grey rag.
        emissive: new THREE.Color('#9fc6d2'),
        emissiveIntensity: 0.16,
      }),
      pool: new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        roughness: 0.22,
        metalness: 0.04,
      }),
      // Drawn on top of the ground it follows. A small depth bias rather than
      // a large lift, so a road hugs a hillside instead of hovering over it.
      road: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
      trail: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.98,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -6,
      }),
      // Fresh water: rougher than the sea, because a river is broken by its own
      // bed and never gives the flat mirror open water does.
      river: new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        roughness: 0.3,
        metalness: 0.05,
        envMapIntensity: 1.1,
      }),
    }
  }
  return cache
}

export function disposeIslandResources(): void {
  if (!cache) return
  cache.terrain.dispose()
  cache.shallow.dispose()
  cache.deep.dispose()
  cache.river.dispose()
  cache.waterfall.dispose()
  cache.pool.dispose()
  cache.road.dispose()
  cache.trail.dispose()
  disposeWaterfallTexture()
  cache = null
}

/** How far the water runs. Far past the fog, so the sea never visibly ends. */
export const OCEAN_HALF = 45_000
