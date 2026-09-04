import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { timeOfDayConfig } from '@/config'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { registerClouds } from '@/scene/timeOfDay/registry'
import { buildCloudField, CLOUD_FIELD_HALF } from './cloudField'
import { cloudTexture, disposeCloudTexture } from './cloudTexture'

/**
 * Drifting cloud billboards, in one draw call.
 *
 * The billboarding happens in the vertex shader from the view matrix, so the
 * whole field is a single static buffer that never needs rewriting as the
 * camera turns. Doing it on the CPU would mean touching every vertex every
 * frame, which is the usual reason billboard clouds cost more than they look.
 *
 * Drift is registered with the shared frame loop rather than opening one here,
 * so clouds move only while something else already is. With traffic and
 * pedestrians off they hold still and the renderer sleeps — which is the whole
 * bargain: no standing cost for motion nobody asked for.
 */

const VERT = /* glsl */ `
  attribute vec2 aCorner;
  attribute float aScale;
  attribute float aOpacity;
  attribute float aDrift;

  uniform float uDrift;
  uniform float uFieldHalf;

  varying vec2 vUv;
  varying float vOpacity;

  void main() {
    vec3 centre = position;

    // Wind along world +x, wrapped so the field is endless. Each cloud carries
    // its own multiplier, so they separate as they travel instead of sliding
    // across the sky as one slab.
    centre.x = mod(centre.x + uDrift * aDrift + uFieldHalf, 2.0 * uFieldHalf) - uFieldHalf;

    // Screen-facing, taken from the view matrix's rows — its first two columns
    // transposed are the camera's right and up in world space.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = centre + (right * aCorner.x + up * aCorner.y) * aScale;

    vUv = aCorner * 0.5 + 0.5;
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vOpacity;

  void main() {
    // Alpha only from the texture; the colour is the hour's. One blob serves a
    // white midday cloud and a bruised purple one at dusk.
    float a = texture2D(uMap, vUv).a * vOpacity * uOpacity;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(uTint, a);
  }
`

export function Clouds() {
  const scene = useThree((s) => s.scene)

  const field = useMemo(() => buildCloudField(), [])

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(field.positions, 3))
    geom.setAttribute('aCorner', new THREE.BufferAttribute(field.corners, 2))
    geom.setAttribute('aScale', new THREE.BufferAttribute(field.scales, 1))
    geom.setAttribute('aOpacity', new THREE.BufferAttribute(field.opacities, 1))
    geom.setAttribute('aDrift', new THREE.BufferAttribute(field.drifts, 1))
    return geom
  }, [field])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        // Normal blending, not additive: a cloud OCCLUDES the sky behind it.
        // Additive would make every overlap brighter and turn a dense cluster
        // into a hotspot.
        transparent: true,
        depthWrite: false,
        // Scene fog would drag them toward the background colour at this
        // distance, which is most of the way to erasing them.
        fog: false,
        uniforms: {
          uMap: { value: cloudTexture() },
          uTint: { value: new THREE.Color() },
          uOpacity: { value: 0 },
          uDrift: { value: 0 },
          uFieldHalf: { value: CLOUD_FIELD_HALF },
        },
      }),
    [],
  )

  useEffect(() => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'clouds'
    // The bounding box is the set of puff CENTRES, which says nothing about
    // where the quads land once the shader has spread them — so culling would
    // drop the field at angles where it is plainly on screen.
    mesh.frustumCulled = false
    // In front of the stars, behind everything real. Clouds sit far outside the
    // city, so pinning the order beats sorting them against it every frame.
    mesh.renderOrder = -900
    mesh.raycast = () => {}
    // Never a shadow caster: the sun's map is rendered once and frozen, so a
    // moving caster would drag a stale shadow across the city behind it.
    mesh.castShadow = false
    mesh.receiveShadow = false
    scene.add(mesh)

    const releaseDrift = registerFrameSystem((_, elapsedMs) => {
      material.uniforms.uDrift.value = (elapsedMs / 1000) * timeOfDayConfig.wind.unitsPerSecond
    })

    const release = registerClouds((blend) => {
      material.uniforms.uTint.value.copy(blend.cloud.tint)
      material.uniforms.uOpacity.value = blend.cloud.opacity
      mesh.visible = blend.cloud.opacity > 0.002
    })

    return () => {
      releaseDrift()
      release()
      scene.remove(mesh)
    }
  }, [scene, geometry, material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      disposeCloudTexture()
    },
    [geometry, material],
  )

  return null
}
