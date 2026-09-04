import * as THREE from 'three'

/**
 * Shared materials for everything in the air, and the one hour-driven write.
 *
 * Module-scoped rather than owned by the component, for the same two reasons
 * `cityResources` is: the time-of-day driver may write to these before or
 * after the component mounts, and a component file that also exports plain
 * functions loses fast refresh.
 */

const BURNER_OUT = new THREE.Color('#3a2a18')
const BURNER_LIT = new THREE.Color('#ffb347')

/**
 * How much of a balloon's own colour its night glow takes.
 *
 * Not all of it: a lit envelope is fabric with a flame behind it, so what
 * comes through is the fabric's colour warmed by the flame, not the fabric's
 * colour alone.
 */
const GLOW_TINT = 0.85

/**
 * Make an emissive take the instance's own colour — its colour, not its level.
 *
 * `instanceColor` multiplies the DIFFUSE and nothing else, which is invisible
 * after dark: an unlit surface has no diffuse to tint, so every balloon in the
 * fleet glowed the same amber the moment the burners came on, however it was
 * painted. Tinting the emissive as well is the fix.
 *
 * But a plain multiply is not it. Tinting by a colour also multiplies by that
 * colour's BRIGHTNESS, and these envelopes average about half — so the first
 * attempt told the fleet apart by making all of it half as bright, and against
 * a night sky at this glow level that is the difference between a balloon and
 * nothing at all. The tint is divided through by its own luminance instead:
 * unit luminance, so the glow lands at exactly the level it did before and the
 * only thing that changed is its hue. A dark blue envelope now reads as a blue
 * lantern rather than as a dim one.
 *
 * Two details about `vColor` that are easy to get wrong, and both of which
 * silently cost the whole fleet — a fragment shader that fails to compile
 * renders nothing at all, so the balloons simply stopped existing at every
 * hour of the day until this was right:
 *
 *   - It is a **vec4**, not a vec3. Read `.rgb`.
 *   - The guard is `USE_COLOR`, not `USE_INSTANCING_COLOR`. Three defines
 *     `USE_COLOR` in the FRAGMENT prefix whenever there are vertex colours OR
 *     an instance colour, and declares `vColor` on that; `USE_INSTANCING_COLOR`
 *     exists only on the vertex side, so guarding on it compiles a reference to
 *     a name the fragment shader has never heard of.
 *
 * Both are pinned by a test that reads three's own chunk source, because both
 * are its implementation detail and free to change under us.
 */
function tintGlowByInstance(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      #ifdef USE_COLOR
        vec3 balloonTint = mix( vec3( 1.0 ), vColor.rgb, float( ${GLOW_TINT} ) );
        float balloonLum = max( dot( balloonTint, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0001 );
        totalEmissiveRadiance *= balloonTint / balloonLum;
      #endif`,
    )
  }
  // Otherwise three shares one compiled program between this material and any
  // untouched standard material with the same parameters, and which of the two
  // shaders the pair ends up with depends on draw order.
  material.customProgramCacheKey = () => 'instance-tinted-emissive'
}

export interface AircraftMaterials {
  envelope: THREE.MeshStandardMaterial
  basket: THREE.MeshStandardMaterial
  burner: THREE.MeshBasicMaterial
  canopy: THREE.MeshStandardMaterial
  body: THREE.MeshStandardMaterial
  rotor: THREE.MeshStandardMaterial
}

let cache: AircraftMaterials | null = null

export function aircraftMaterials(): AircraftMaterials {
  if (!cache) {
    cache = {
      envelope: new THREE.MeshStandardMaterial({
        roughness: 0.78,
        metalness: 0,
        // Lit from within after dark; `applyAircraftTimeOfDay` sets how much.
        emissive: new THREE.Color('#ffb066'),
        emissiveIntensity: 0,
      }),
      basket: new THREE.MeshStandardMaterial({
        color: '#7a5c3a',
        roughness: 0.9,
        metalness: 0,
      }),
      burner: new THREE.MeshBasicMaterial({
        color: BURNER_OUT,
        transparent: true,
        opacity: 0.15,
        // Additive, because a flame is light rather than a surface: it should
        // brighten the envelope behind it instead of masking it out.
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      canopy: new THREE.MeshStandardMaterial({
        roughness: 0.72,
        metalness: 0,
        // A canopy is a fabric shell, seen from every side as it turns.
        side: THREE.DoubleSide,
      }),
      body: new THREE.MeshStandardMaterial({
        color: '#33404b',
        roughness: 0.5,
        metalness: 0.25,
      }),
      rotor: new THREE.MeshStandardMaterial({
        color: '#1c2228',
        roughness: 0.6,
        metalness: 0.2,
        transparent: true,
        // A turning rotor is mostly air. Half-transparent is what reads as
        // motion in a still frame, and it costs nothing.
        opacity: 0.45,
      }),
    }
    tintGlowByInstance(cache.envelope)
  }
  return cache
}

/**
 * Push one hour's artificial light onto the sky.
 *
 * Called by the time-of-day driver through `applyBlend`, never from a React
 * effect keyed to the hour — the same single-writer rule the city follows. An
 * effect keyed that way snaps to the TARGET the instant a transition begins,
 * so the balloons would arrive at night while the tower was still crossing
 * dusk.
 *
 * Riding the LAMP channel rather than the windows': a burner and a street lamp
 * are both artificial light that comes on as the daylight goes.
 */
export function applyAircraftTimeOfDay(lampGlow: number): void {
  if (!cache) return
  cache.burner.color.lerpColors(BURNER_OUT, BURNER_LIT, lampGlow)
  cache.burner.opacity = 0.15 + 0.85 * lampGlow
  // A lantern, not a light source: the envelope picks up its own burner from
  // the inside. Kept well under the windows' glow so a balloon never competes
  // with the tower it is drifting past.
  //
  //
  // Do not raise this to pay for the per-balloon tint, however tempting: the
  // ratio has to clear the city's windows at EVERY key of the blend, and the
  // tightest of them (0.22 against 0.6) leaves almost nothing over. The tint
  // costs nothing to pay for — it is normalised to unit luminance, so it
  // changes the glow's colour and not its level. See `tintGlowByInstance`.
  cache.envelope.emissiveIntensity = lampGlow * 0.35
}

export function disposeAircraftMaterials(): void {
  if (!cache) return
  for (const m of Object.values(cache)) m.dispose()
  cache = null
}
