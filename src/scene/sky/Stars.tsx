import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { registerStars } from '@/scene/timeOfDay/registry'
import { getQualityTier } from '@/utils/quality'
import { buildStarField } from './starField'

/**
 * The stars, as one `THREE.Points`.
 *
 * Points rather than a hash in the dome's fragment shader, which is how an
 * earlier attempt did it. A hash gives every star the same size and the same
 * brightness and offers nowhere to hang a twinkle; attributes give each one its
 * own, and the whole sky is still a single draw call.
 *
 * Pinned to the far plane and re-centred on the camera by the same trick the
 * dome uses, so the field sits at an infinite distance however far the camera
 * pulls back — and so nothing in the city can ever be behind it.
 */

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aPhase;
  attribute float aFrequency;
  attribute float aAmplitude;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uIntensity;

  varying float vAlpha;

  void main() {
    // Each star dips on its own phase and its own period, so the field
    // shimmers rather than pulsing in unison — which is what a shared clock
    // would give, and what reads instantly as a fault rather than as a sky.
    float twinkle = 1.0 - aAmplitude * (0.5 + 0.5 * sin(uTime * aFrequency + aPhase));
    vAlpha = aBrightness * twinkle * uIntensity;

    mat4 rotationOnly = mat4(mat3(modelViewMatrix));
    vec4 clip = projectionMatrix * rotationOnly * vec4(position, 1.0);
    gl_Position = clip.xyww;

    // No size attenuation, deliberately: these are infinitely far away, so
    // their apparent size must not change when the camera dollies.
    gl_PointSize = aSize * uPixelRatio;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;

  void main() {
    // Round and soft-edged. A square point is the other giveaway of a
    // generated sky, and at these sizes the falloff is most of the shape.
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float a = (1.0 - smoothstep(0.0, 1.0, r)) * vAlpha;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * a, a);
  }
`

export function Stars() {
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)

  const field = useMemo(() => buildStarField(getQualityTier().stars), [])

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(field.positions, 3))
    geom.setAttribute('aSize', new THREE.BufferAttribute(field.sizes, 1))
    geom.setAttribute('aBrightness', new THREE.BufferAttribute(field.brightness, 1))
    geom.setAttribute('aPhase', new THREE.BufferAttribute(field.phases, 1))
    geom.setAttribute('aFrequency', new THREE.BufferAttribute(field.frequencies, 1))
    geom.setAttribute('aAmplitude', new THREE.BufferAttribute(field.amplitudes, 1))
    return geom
  }, [field])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        // Additive, so a star sits IN the sky it is drawn on and fades with it
        // rather than punching a hole through the gradient.
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          // Point size is in device pixels, so it has to know the ratio it is
          // drawn at or stars come out twice the size on a retina screen. Set
          // at construction rather than written afterwards: it never changes
          // for the life of the renderer, and the app reads its quality tier
          // once for the same reason.
          uPixelRatio: { value: gl.getPixelRatio() },
          uIntensity: { value: 0 },
        },
      }),
    [gl],
  )

  useEffect(() => {
    const points = new THREE.Points(geometry, material)
    points.name = 'stars'
    points.frustumCulled = false
    // In front of the dome, behind everything real.
    points.renderOrder = -950
    points.raycast = () => {}
    scene.add(points)

    // The twinkle clock, on the shared loop. When nothing else is animating the
    // stars simply hold — still, not broken.
    const releaseTwinkle = registerFrameSystem((_, elapsedMs) => {
      material.uniforms.uTime.value = elapsedMs / 1000
    })

    const release = registerStars((blend) => {
      material.uniforms.uIntensity.value = blend.starIntensity
      // The field is drawn at all hours and simply reaches zero brightness by
      // day; skipping the draw would save one call and cost a branch that has
      // to stay in step with the blend.
      points.visible = blend.starIntensity > 0.002
    })

    return () => {
      releaseTwinkle()
      release()
      scene.remove(points)
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
