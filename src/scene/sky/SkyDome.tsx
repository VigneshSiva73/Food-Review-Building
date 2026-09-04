import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registerSkyDome } from '@/scene/timeOfDay/registry'
import type { BlendedPreset } from '@/scene/timeOfDay/blendPreset'
import { dirFromAngles } from './angles'

/**
 * The sky you can actually see.
 *
 * A shader on the inside of a sphere, not a texture. The first attempt at this
 * showed the reflection probe itself as the background and looked worse than
 * the flat colour it replaced: at 256×128 the gradient banded, the seam showed
 * as a hard line overhead, and the frame washed out until the city read as
 * black cut-outs. A fragment shader has no resolution to run out of, and it can
 * put a real sun up there rather than a smudge.
 *
 * Three deliberate choices:
 *
 * - The horizon colour IS the fog and background colour — one field on the
 *   keyframe feeds all three — so the far city dissolves into the sky instead
 *   of ending in a hard silhouette. That was the specific failure of the
 *   textured-background attempt, and deriving it beats keeping three strings
 *   equal by hand.
 * - `fog: false`. Scene fog would tint the dome toward its own colour, which at
 *   distance means tinting it toward *itself* — the horizon would flatten to a
 *   single band and the gradient would disappear.
 * - Drawn first, with depth writing off, so it is a backdrop rather than
 *   geometry: nothing z-fights with it and it never occludes the city.
 */

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    // The mesh is not rotated, so a vertex's own position IS the direction to
    // that patch of sky.
    vDir = normalize(position);

    // Rotation only: dropping the view translation re-centres the dome on the
    // camera every frame, which is what makes it behave as an infinitely
    // distant backdrop and what makes its radius genuinely irrelevant.
    //
    // Both halves are needed. xyww alone pins DEPTH to the far plane but does
    // nothing about extent, so a unit sphere still projects to a dot in the
    // middle of the screen — which is exactly what happened: the "sky" on
    // screen was the raw background colour, flat and gradientless, and the dome
    // was drawing a few pixels wide behind the tower.
    mat4 rotationOnly = mat4(mat3(modelViewMatrix));
    vec4 clip = projectionMatrix * rotationOnly * vec4(position, 1.0);
    gl_Position = clip.xyww;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vDir;

  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlowColor;
  uniform float uGlowStrength;

  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;      // angular radius, radians
  uniform float uSunIntensity;

  uniform vec3 uMoonDir;
  uniform vec3 uMoonColor;
  uniform float uMoonSize;
  uniform float uMoonIntensity;

  uniform float uMilkyWay;

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -1.0, 1.0);

    // Gradient. The exponent keeps most of the change close to the horizon,
    // which is where a real sky does most of its changing.
    float t = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);

    // Below the horizon the sky continues into haze rather than stopping, so
    // there is never a visible edge where the dome meets the ground plane.
    col = mix(col, uHorizon, clamp(-h * 6.0, 0.0, 1.0));

    // Warm band hugging the horizon and leaning toward the sun: dawn and dusk
    // light, or after dark the city's own sodium haze thrown back down.
    // Leaning matters — a band ringing the whole sky evenly reads as a filter
    // over the image rather than as light coming from somewhere.
    if (uGlowStrength > 0.001) {
      float band = exp(-abs(h) * 7.0);
      float toward = clamp(dot(normalize(vec3(dir.x, 0.0, dir.z)),
                               normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), -1.0, 1.0);
      toward = pow(clamp(toward * 0.5 + 0.5, 0.0, 1.0), 2.2);
      col += uGlowColor * band * toward * uGlowStrength;
    }

    // A faint band across the sky, on a fixed axis. Deliberately at the very
    // edge of visible: this is a city under light pollution, and a galaxy
    // overhead would be a different picture from the one the app is about.
    if (uMilkyWay > 0.001) {
      float d = dot(dir, normalize(vec3(0.55, 0.5, -0.67)));
      col += vec3(0.66, 0.71, 0.85) * exp(-d * d / (2.0 * 0.13 * 0.13)) * uMilkyWay * 0.045;
    }

    // The sun: a hard disc with a soft halo around it.
    if (uSunIntensity > 0.001) {
      float a = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
      float disc = 1.0 - smoothstep(uSunSize * 0.85, uSunSize, a);
      float halo = exp(-a * a / (uSunSize * uSunSize * 26.0)) * 0.5;
      col += uSunColor * (disc + halo) * uSunIntensity;
    }

    // The moon: the same shape as the sun, plus a shading term so it reads as
    // a lit sphere rather than a flat white dot.
    if (uMoonIntensity > 0.001) {
      float a = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
      float disc = 1.0 - smoothstep(uMoonSize * 0.9, uMoonSize, a);
      float halo = exp(-a * a / (uMoonSize * uMoonSize * 16.0)) * 0.22;
      float shade = 0.72 + 0.28 * clamp(1.0 - a / max(uMoonSize, 1e-4), 0.0, 1.0);
      col += uMoonColor * (disc * shade + halo) * uMoonIntensity;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const DEG = Math.PI / 180

export function SkyDome() {
  const scene = useThree((s) => s.scene)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGlowColor: { value: new THREE.Color() },
          uGlowStrength: { value: 0 },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uSunSize: { value: DEG },
          uSunIntensity: { value: 0 },
          uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
          uMoonColor: { value: new THREE.Color() },
          uMoonSize: { value: DEG },
          uMoonIntensity: { value: 0 },
          uMilkyWay: { value: 0 },
        },
      }),
    [],
  )

  // Radius is irrelevant to the shading — every fragment shades from its own
  // direction — and irrelevant to depth, since the vertex shader pins it to the
  // far plane. So this is a unit sphere and stays one.
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 48, 32), [])

  useEffect(() => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'sky-dome'
    // Never culled and never depth-sorted into the scene: it is a backdrop.
    mesh.frustumCulled = false
    mesh.renderOrder = -1000
    mesh.raycast = () => {}
    scene.add(mesh)

    const sunDir = new THREE.Vector3()
    const moonDir = new THREE.Vector3()
    const u = material.uniforms

    const release = registerSkyDome((blend: BlendedPreset) => {
      u.uZenith.value.copy(blend.sky.zenith)
      // The horizon is the background, not a value of its own.
      u.uHorizon.value.copy(blend.background)
      u.uGlowColor.value.copy(blend.sky.glowColor)
      u.uGlowStrength.value = blend.sky.glowStrength

      u.uSunDir.value.copy(
        dirFromAngles(blend.sunDisc.azimuthDeg, blend.sunDisc.elevationDeg, sunDir),
      )
      u.uSunColor.value.copy(blend.sunDisc.color)
      u.uSunSize.value = Math.max(blend.sunDisc.sizeDeg, 0.05) * DEG
      u.uSunIntensity.value = blend.sunDisc.intensity

      u.uMoonDir.value.copy(
        dirFromAngles(blend.moonDisc.azimuthDeg, blend.moonDisc.elevationDeg, moonDir),
      )
      u.uMoonColor.value.copy(blend.moonDisc.color)
      u.uMoonSize.value = Math.max(blend.moonDisc.sizeDeg, 0.05) * DEG
      u.uMoonIntensity.value = blend.moonDisc.intensity

      u.uMilkyWay.value = blend.milkyWay
    })

    return () => {
      release()
      scene.remove(mesh)
    }
  }, [scene, geometry, material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return null
}
