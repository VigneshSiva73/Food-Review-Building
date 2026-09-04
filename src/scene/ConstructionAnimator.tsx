import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  buildTimeline,
  easeOutCubic,
  floorProgress,
  revealedFloorCount,
  type ConstructionTimeline,
} from '@/building/timeline'
import { useAnimationStore } from '@/state/useAnimationStore'
import { MAX_FRAME_DELTA_S } from '@/utils/motion'
import type { ConstructionRegistry } from './construction'
import { composeInstance } from './instancing'

/** Shadow maps are frozen (plan §32); refresh them at this cadence while building. */
const SHADOW_REFRESH_S = 0.1

function applyProgress(
  registry: ConstructionRegistry,
  timeline: ConstructionTimeline,
  elapsedMs: number,
  maxVisibleFloors: number,
) {
  const counts = {
    pillar: revealedFloorCount(timeline, 'pillar', elapsedMs),
    slab: revealedFloorCount(timeline, 'slab', elapsedMs),
    detail: revealedFloorCount(timeline, 'detail', elapsedMs),
  }

  for (const reg of registry.instanced.values()) {
    const revealed = Math.min(counts[reg.phase], timeline.floorCount, maxVisibleFloors)
    const count = reg.prefix[revealed] ?? reg.transforms.length
    reg.mesh.count = count

    if (!reg.grows) continue
    for (let i = 0; i < count; i++) {
      const p = floorProgress(timeline, reg.floorOf[i], elapsedMs)[reg.phase]
      reg.mesh.setMatrixAt(i, composeInstance(reg.transforms[i], easeOutCubic(p)))
    }
    reg.mesh.instanceMatrix.needsUpdate = true
  }

  for (const reg of registry.ranged.values()) {
    const revealed = Math.min(counts[reg.phase], timeline.floorCount, maxVisibleFloors)
    reg.geometry.setDrawRange(0, revealed * reg.vertsPerFloor)
  }
}

/**
 * Final (post-animation) state, still honouring the day-slider cap: the
 * slicer works by lowering instance counts and draw ranges, exactly like the
 * construction reveal — hidden floors also become unpickable for free, since
 * raycasting respects both.
 */
function applyFinal(registry: ConstructionRegistry, maxVisibleFloors: number) {
  for (const reg of registry.instanced.values()) {
    const count = reg.prefix[Math.min(maxVisibleFloors, reg.prefix.length - 1)] ?? reg.transforms.length
    reg.mesh.count = count
    if (!reg.grows) continue
    for (let i = 0; i < count; i++) {
      reg.mesh.setMatrixAt(i, composeInstance(reg.transforms[i]))
    }
    reg.mesh.instanceMatrix.needsUpdate = true
  }
  for (const reg of registry.ranged.values()) {
    reg.geometry.setDrawRange(
      0,
      Number.isFinite(maxVisibleFloors) ? maxVisibleFloors * reg.vertsPerFloor : Infinity,
    )
  }
}

/**
 * Drives the construction intro (plan §29): one clock, no per-object tweens.
 * Floors assemble bottom-up — pillars grow to their rating height, the tilted
 * plate lands, then the facade settles in. On completion the final state is
 * written once and all per-frame work stops.
 */
export function ConstructionAnimator({
  registry,
  floorCount,
  /** Day-slider cap: floors beyond this stay hidden even when built. */
  maxVisibleFloors = Infinity,
  /** Bump to re-apply state after the Building rebuilds its GPU objects. */
  contentKey,
}: {
  registry: RefObject<ConstructionRegistry>
  floorCount: number
  maxVisibleFloors?: number
  contentKey: unknown
}) {
  const phase = useAnimationStore((s) => s.phase)
  const runNonce = useAnimationStore((s) => s.runNonce)
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)

  const elapsedRef = useRef(0)
  const shadowClock = useRef(0)
  const timeline = useMemo(() => buildTimeline(floorCount), [floorCount])

  // Restart the clock on replay or when the dataset changes.
  useEffect(() => {
    elapsedRef.current = 0
    invalidate()
  }, [runNonce, floorCount, invalidate])

  // Apply before paint so the finished building never flashes into view —
  // and re-apply whenever the day slider moves, which is the slicer reveal.
  useLayoutEffect(() => {
    if (!registry.current) return
    if (phase === 'done') applyFinal(registry.current, maxVisibleFloors)
    else applyProgress(registry.current, timeline, elapsedRef.current, maxVisibleFloors)
    // oxlint-disable-next-line react/immutability -- three.js renderer state is mutable by design.
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [registry, timeline, phase, runNonce, contentKey, maxVisibleFloors, gl, invalidate])

  useFrame((_, delta) => {
    if (phase === 'done' || !registry.current) return

    elapsedRef.current += Math.min(delta, MAX_FRAME_DELTA_S) * 1000
    const elapsed = elapsedRef.current
    applyProgress(registry.current, timeline, elapsed, maxVisibleFloors)

    shadowClock.current += delta
    if (shadowClock.current >= SHADOW_REFRESH_S) {
      shadowClock.current = 0
      // oxlint-disable-next-line react/immutability
      gl.shadowMap.needsUpdate = true
    }

    if (elapsed >= timeline.totalMs) {
      applyFinal(registry.current, maxVisibleFloors)
      // oxlint-disable-next-line react/immutability
      gl.shadowMap.needsUpdate = true
      useAnimationStore.getState().skip()
    }
    invalidate()
  })

  return null
}
