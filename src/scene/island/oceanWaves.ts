import * as THREE from 'three'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'

/**
 * A wind sea, built from the way water actually behaves.
 *
 * The first version was four sine waves at scattered bearings with made-up
 * speeds, and it read as a lumpy pond rather than as sea. Four things were
 * wrong with it, and each has a name in the literature:
 *
 * 1. SINES. A sine wave is symmetric — round crest, round trough — and the
 *    ocean is not. Gerstner showed in 1802 that surface particles do not just
 *    rise and fall, they also shuffle horizontally toward the passing crest;
 *    the water piles up under the crest and pinches it into a ridge, leaving
 *    the troughs broad and flat. The free surface is an inverted trochoid.
 *    That asymmetry is most of what the eye recognises as water, and it costs
 *    one extra cosine per component.
 *
 * 2. SPEED. Each component was given a speed chosen to look busy, and the
 *    short ones were made the fastest — backwards. Deep-water gravity waves
 *    obey w = sqrt(g k), so the LONG swell outruns the chop. Get that wrong
 *    and the components drift through each other at rates no sea ever shows;
 *    get it right and the interference pattern between them is the real one,
 *    which is what stops a summed sea looking like it repeats.
 *
 * 3. AMPLITUDE. Heights were free numbers. Here each component is given a
 *    STEEPNESS (A·k) instead and its height follows from its length, which is
 *    how an ocean spectrum works: energy falls off toward the short end. Water
 *    breaks at H/L = 1/7, so A·k = pi/7 ~ 0.45 is the ceiling for any one
 *    component, and the steepnesses below sit well under it.
 *
 * 4. DIRECTION. Scattered bearings give a confused sea, which is a real thing
 *    but a rare one. A wind sea is strongly directional: crests run as long
 *    parallel lines square to the wind, with the shorter components spread
 *    only a little either side of it. So these are clustered around one
 *    bearing, with a single longer swell arriving from another quarter — wind
 *    sea plus swell, which is what most open water is.
 *
 * WHERE EACH SCALE IS COMPUTED matters as much as the numbers. The sheet has a
 * vertex about every 115 units, so:
 *
 *   - the two longest components displace GEOMETRY, because a swell you can
 *     see the shape of has to lift the surface;
 *   - components down to a couple of triangles long shape the VERTEX normal;
 *   - everything shorter is computed PER FRAGMENT, because a wavelength below
 *     a triangle cannot be interpolated — sampling it at the corners produces
 *     aliasing, not detail. The old code shaded a 118-unit wave from vertices
 *     115 apart, which is under one sample per period.
 *
 * The clock is a uniform the frame loop writes, in seconds, so the dispersion
 * relation gives real periods: about 25s for the long swell. It starts at a
 * non-zero REST PHASE on purpose — the world can be frozen, and a sea at t = 0
 * is a sea with every wave at its zero crossing, which is a flat sheet.
 */

export interface OceanWaveUniforms {
  uTime: { value: number }
  uAmplitude: { value: number }
  uChoppiness: { value: number }
}

/**
 * The spectrum, shared by both stages so they describe one sea.
 *
 * Written as a snippet that DECLARES and fills a local array, and pasted into
 * each function that needs it, rather than as a function taking the array as a
 * parameter: array parameters are not safe in GLSL ES 1.00, which is what
 * three compiles to on WebGL 1. One copy in this file, two in the shader.
 *
 * Each row is `direction.xy, wavelength, steepness`. Ordered long to short:
 * the vertex stage takes the head of the list and the fragment stage the tail.
 */
export interface WaveComponent {
  /** Bearing the crests travel along. Normalised in the shader. */
  dir: readonly [number, number]
  /** Crest to crest, in world units. */
  wavelength: number
  /** A·k. Water breaks at pi/7, so every one of these sits well under it. */
  steepness: number
}

/**
 * The sea, long to short.
 *
 * One swell across the wind, then the wind sea itself: crests square to the
 * wind and spread only a little either side of it, with the energy falling off
 * toward the short end the way a spectrum does. The vertex stage takes the head
 * of this list and the fragment stage the tail; `oceanConfig` says where.
 */
export const OCEAN_SPECTRUM: readonly WaveComponent[] = Object.freeze([
  { dir: [-0.42, 0.91], wavelength: 980, steepness: 0.112 },
  { dir: [0.94, 0.34], wavelength: 780, steepness: 0.104 },
  { dir: [0.83, 0.56], wavelength: 470, steepness: 0.09 },
  { dir: [0.99, 0.14], wavelength: 295, steepness: 0.076 },
  { dir: [0.76, 0.65], wavelength: 178, steepness: 0.061 },
  { dir: [0.97, -0.23], wavelength: 104, steepness: 0.049 },
  { dir: [0.88, 0.47], wavelength: 58, steepness: 0.037 },
  { dir: [-0.58, 0.81], wavelength: 31, steepness: 0.027 },
] satisfies WaveComponent[])

/**
 * How many components move the mesh, and how many it can shade at its corners.
 *
 * Both 2, and the second one is not a guess: the sheet is 96 vertices across
 * its 18,400 units on the coarse tier, so a vertex every 193 units, and a wave
 * needs four samples to a period before its shape survives the corners. Only
 * the 980 and the 780 clear that. Everything else is evaluated per fragment,
 * where the tessellation does not come into it — which is the whole reason the
 * fragment stage exists, and why six of the eight live there.
 */
export const WAVE_DISPLACE = 2
export const WAVE_VERTEX = 2

/**
 * The spectrum as GLSL that DECLARES and fills a local array, pasted into each
 * function that needs it.
 *
 * A snippet rather than a function taking the array as a parameter: array
 * parameters are not safe in GLSL ES 1.00, which is what three compiles to on
 * WebGL 1. Generated from the table above, so there is one source of truth and
 * the tests can read it as data.
 */
const TABLE = OCEAN_SPECTRUM.map(
  (w, i) =>
    `    s[${i}] = vec4(${w.dir[0].toFixed(2)}, ${w.dir[1].toFixed(2)}, ${w.wavelength.toFixed(1)}, ${w.steepness.toFixed(4)});`,
).join('\n')

const ARRAY = `    vec4 s[WAVE_COUNT];\n${TABLE}\n`

const DEFINES = /* glsl */ `
  #define WAVE_COUNT ${OCEAN_SPECTRUM.length}
  #define WAVE_DISPLACE ${WAVE_DISPLACE}
  #define WAVE_VERTEX ${WAVE_VERTEX}
  /** Deep-water dispersion, w = sqrt(g k). */
  #define GRAVITY 9.81
`

const VERTEX_CHUNK = /* glsl */ `
  attribute float waveMask;
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uChoppiness;
  varying vec2 vWavePos;
  varying float vWaveWeight;
  /**
   * The sheet's own axes, in VIEW space.
   *
   * The fragment stage perturbs a normal that three has already taken to view
   * space, so it needs somewhere to put an object-space slope. Neither
   * modelViewMatrix nor normalMatrix is declared in the fragment shader,
   * and the sheet is a flat quad with no rotation of its own, so the two axes
   * are constant over it and cost two varyings to hand across.
   */
  varying vec3 vWaveAxisX;
  varying vec3 vWaveAxisZ;

${DEFINES}

  /**
   * Trochoidal sum over the long components.
   *
   * The height and shift outputs are the Gerstner displacement: vertical, and
   * the horizontal shuffle toward the crest that sharpens it. The slope output
   * is the surface gradient, taken from the sine term because the trochoid's
   * exact normal costs more than it is worth at this tessellation.
   */
  void oceanVertex(vec2 p, float t, out float height, out vec2 shift, out vec2 slope) {
    height = 0.0;
    shift = vec2(0.0);
    slope = vec2(0.0);
${ARRAY}    for (int i = 0; i < WAVE_VERTEX; i++) {
      vec2 dir = normalize(s[i].xy);
      float k = 6.2831853 / s[i].z;
      // Height from steepness, not the other way round. See the header.
      float amp = s[i].w / k;
      float phase = dot(p, dir) * k + t * sqrt(GRAVITY * k);
      slope += dir * s[i].w * cos(phase);
      // Only the components the mesh can carry are allowed to move it.
      if (i < WAVE_DISPLACE) {
        height += amp * sin(phase);
        shift += dir * amp * cos(phase);
      }
    }
  }
`

const FRAGMENT_CHUNK = /* glsl */ `
  uniform float uTime;
  varying vec2 vWavePos;
  varying float vWaveWeight;
  varying vec3 vWaveAxisX;
  varying vec3 vWaveAxisZ;

${DEFINES}

  /**
   * The chop, per fragment.
   *
   * Slope only — nothing this short is worth moving the surface for, and at
   * these wavelengths the surface IS its shading. Computed here rather than at
   * the vertices because the shortest of them is a thirtieth of a triangle,
   * and a wave sampled once per thirty periods is noise.
   */
  vec2 oceanChopSlope(vec2 p, float t) {
${ARRAY}    vec2 slope = vec2(0.0);
    for (int i = WAVE_VERTEX; i < WAVE_COUNT; i++) {
      vec2 dir = normalize(s[i].xy);
      float k = 6.2831853 / s[i].z;
      slope += dir * s[i].w * cos(dot(p, dir) * k + t * sqrt(GRAVITY * k));
    }
    return slope;
  }
`

/**
 * Patch a water material with a wind sea. Returns the uniforms the loop
 * advances.
 *
 * Safe to call once per material: `onBeforeCompile` runs on the next compile,
 * and the returned uniforms are shared with the shader by reference.
 */
export function applyOceanWaves(
  material: THREE.MeshStandardMaterial,
  c: IslandConfig = islandConfig,
): OceanWaveUniforms {
  const uniforms: OceanWaveUniforms = {
    // Seeded rather than zero, so a frozen sea is still a sea. See above.
    uTime: { value: c.ocean.restPhase },
    uAmplitude: { value: c.ocean.amplitude },
    uChoppiness: { value: c.ocean.choppiness },
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uAmplitude = uniforms.uAmplitude
    shader.uniforms.uChoppiness = uniforms.uChoppiness

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_CHUNK}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float waveHeight;
        vec2 waveShift;
        vec2 waveSlope;
        oceanVertex(position.xz, uTime, waveHeight, waveShift, waveSlope);
        vWavePos = position.xz;
        vWaveWeight = waveMask;
        vWaveAxisX = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vWaveAxisZ = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        float lift = uAmplitude * waveMask;
        objectNormal = normalize(vec3(-waveSlope.x * lift, 1.0, -waveSlope.y * lift));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y += waveHeight * uAmplitude * waveMask;
        // The Gerstner shuffle. Masked with everything else, so the sheet
        // still meets the sand and the horizon plane without tearing.
        transformed.xz += waveShift * uChoppiness * uAmplitude * waveMask;`,
      )

    // The chop. Perturbs the finished normal, after the ripple map has had its
    // say, so both survive: the map is isotropic and this is not.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_CHUNK}`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 chop = oceanChopSlope(vWavePos, uTime) * vWaveWeight;
        // Object-space slope, laid onto the view-space normal through the
        // sheet's own axes. Same construction as the vertex stage's
        // normalize(vec3(-slope.x, 1, -slope.y)), one basis change later.
        normal = normalize(normal - chop.x * vWaveAxisX - chop.y * vWaveAxisZ);`,
      )
  }
  // Force a recompile if the material has already been used.
  material.needsUpdate = true
  return uniforms
}
