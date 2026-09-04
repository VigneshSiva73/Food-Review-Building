import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { signalStateAt, type SignalPhase, type SignalPost, type SignalState } from '@/city'
import { noopRaycast, writeInstances, type AnyTransform } from '../instancing'
import { registerFrameSystem } from '@/scene/animation/frameSystems'
import { cityMaterials } from './cityResources'
import {
  ASPECTS,
  ASPECT_OFFSETS,
  headHeight,
  LAMP_FACE_Z,
  signalLampGeometry,
  signalPostGeometry,
} from './signalGeometry'

/**
 * Traffic signal heads (plan §22).
 *
 * Two draw calls: every post in one InstancedMesh, every aspect of every post
 * in another. The aspects change colour rather than swapping meshes, using
 * `instanceColor` over an unlit material — which is what a lamp is. A lit lens
 * does not respond to the sun, and an unlit one is not a darker shade of the
 * same thing, it is a different colour entirely.
 *
 * This is the first phase where the signal cycle is visible. The traffic has
 * been obeying it since phase 6 and the pedestrians since phase 7; all this
 * does is show you the number they were reading.
 */

const ON: Record<SignalState, THREE.Color> = {
  red: new THREE.Color('#ff4436'),
  yellow: new THREE.Color('#ffc42e'),
  green: new THREE.Color('#3ee05c'),
}

/** Unlit aspects are a dark glass version of their own colour, not black. */
const OFF: Record<SignalState, THREE.Color> = {
  red: new THREE.Color('#341613'),
  yellow: new THREE.Color('#33290f'),
  green: new THREE.Color('#12301a'),
}

export function TrafficSignals({
  posts,
  signals,
}: {
  posts: SignalPost[]
  signals: SignalPhase[]
}) {
  const materials = cityMaterials()
  const postMesh = useRef<THREE.InstancedMesh>(null)
  const lampMesh = useRef<THREE.InstancedMesh>(null)

  const postTransforms = useMemo<AnyTransform[]>(
    () =>
      posts.map((p) => ({
        position: { x: p.position.x, y: p.baseY, z: p.position.z },
        scale: { x: 1, y: 1, z: 1 },
        rotY: p.rotationY,
      })),
    [posts],
  )

  /**
   * One entry per aspect of every post, in post-major order. Each aspect sits
   * on the housing's face, so its world position is the post's own yaw applied
   * to a fixed local offset.
   */
  const lamps = useMemo(() => {
    const transforms: AnyTransform[] = []
    const signalOf: number[] = []
    const aspectOf: SignalState[] = []
    for (const post of posts) {
      const sin = Math.sin(post.rotationY)
      const cos = Math.cos(post.rotationY)
      for (const aspect of ASPECTS) {
        transforms.push({
          position: {
            x: post.position.x + sin * LAMP_FACE_Z,
            y: post.baseY + headHeight() + ASPECT_OFFSETS[aspect],
            z: post.position.z + cos * LAMP_FACE_Z,
          },
          scale: { x: 1, y: 1, z: 1 },
          rotY: post.rotationY,
        })
        signalOf.push(post.signal)
        aspectOf.push(aspect)
      }
    }
    return { transforms, signalOf, aspectOf }
  }, [posts])

  const paint = useCallback(
    (elapsedMs: number) => {
      const mesh = lampMesh.current
      if (!mesh) return
      // Resolve each signal once, not once per aspect.
      const state = signals.map((s) => signalStateAt(elapsedMs, s))
      for (let i = 0; i < lamps.aspectOf.length; i++) {
        const aspect = lamps.aspectOf[i]
        const lit = state[lamps.signalOf[i]] === aspect
        mesh.setColorAt(i, lit ? ON[aspect] : OFF[aspect])
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    [lamps, signals],
  )

  useLayoutEffect(() => {
    if (postMesh.current) writeInstances(postMesh.current, postTransforms)
    if (lampMesh.current) writeInstances(lampMesh.current, lamps.transforms)
    paint(0)
  }, [postTransforms, lamps, paint])

  useEffect(() => {
    let shown = -1
    return registerFrameSystem((_dt, elapsedMs) => {
      // The cycle changes a few times a minute. Repainting 48 instance colours
      // every frame would upload a buffer that is almost always identical, so
      // this only touches the GPU when the phase actually turns over.
      const phase = Math.floor(elapsedMs / 250)
      if (phase === shown) return
      shown = phase
      paint(elapsedMs)
    })
  }, [paint])

  if (posts.length === 0) return null

  return (
    <group name="city-signals">
      <instancedMesh
        ref={postMesh}
        name="city-signal-posts"
        args={[signalPostGeometry(), materials.streetMetal, posts.length]}
        raycast={noopRaycast}
        receiveShadow
      />
      <instancedMesh
        ref={lampMesh}
        name="city-signal-lamps"
        args={[signalLampGeometry(), materials.lamp, lamps.transforms.length]}
        raycast={noopRaycast}
      />
    </group>
  )
}
