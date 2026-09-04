import { beforeEach, describe, expect, it } from 'vitest'
import { useAnimationStore } from './useAnimationStore'
import { useRuntimeStore } from './useRuntimeStore'
import { useSelectionStore } from './useSelectionStore'
import { useViewStore } from './useViewStore'

describe('useSelectionStore', () => {
  beforeEach(() => useSelectionStore.getState().clear())

  it('ignores redundant hover updates so the scene does not re-render', () => {
    const ref = { kind: 'pillar', floorIndex: 2, corner: 1 } as const
    useSelectionStore.getState().setHovered(ref)
    const first = useSelectionStore.getState().hovered
    useSelectionStore.getState().setHovered({ kind: 'pillar', floorIndex: 2, corner: 1 })
    expect(useSelectionStore.getState().hovered).toBe(first)
  })

  it('replaces hover when the target actually changes', () => {
    useSelectionStore.getState().setHovered({ kind: 'pillar', floorIndex: 2, corner: 1 })
    useSelectionStore.getState().setHovered({ kind: 'floor', floorIndex: 2 })
    expect(useSelectionStore.getState().hovered).toEqual({ kind: 'floor', floorIndex: 2 })
  })

  it('clears both hover and selection', () => {
    useSelectionStore.getState().setHovered({ kind: 'floor', floorIndex: 1 })
    useSelectionStore.getState().select({ kind: 'floor', floorIndex: 3 })
    useSelectionStore.getState().clear()
    expect(useSelectionStore.getState()).toMatchObject({ hovered: null, selected: null })
  })
})

describe('useViewStore', () => {
  it('toggles view options independently', () => {
    const before = useViewStore.getState().autoRotate
    useViewStore.getState().toggleAutoRotate()
    expect(useViewStore.getState().autoRotate).toBe(!before)
    useViewStore.getState().toggleAutoRotate()
    expect(useViewStore.getState().autoRotate).toBe(before)

    const explode = useViewStore.getState().explode
    useViewStore.getState().toggleExplode()
    expect(useViewStore.getState().explode).toBe(!explode)
    useViewStore.getState().toggleExplode()
  })

  it('signals camera resets with a monotonic counter', () => {
    const start = useViewStore.getState().resetSignal
    useViewStore.getState().requestCameraReset()
    useViewStore.getState().requestCameraReset()
    expect(useViewStore.getState().resetSignal).toBe(start + 2)
  })

  it('gives repeated focus requests on one target a fresh nonce', () => {
    const ref = { kind: 'floor', floorIndex: 7 } as const
    useViewStore.getState().requestFocus(ref)
    const first = useViewStore.getState().focusRequest!
    useViewStore.getState().requestFocus(ref)
    const second = useViewStore.getState().focusRequest!
    expect(second.ref).toEqual(ref)
    expect(second.nonce).toBeGreaterThan(first.nonce)
  })

  it('carries the full selection so pillars can be framed individually', () => {
    const pillar = { kind: 'pillar', floorIndex: 3, corner: 2 } as const
    useViewStore.getState().requestFocus(pillar)
    expect(useViewStore.getState().focusRequest?.ref).toEqual(pillar)
  })
})

describe('useAnimationStore', () => {
  it('skips to the finished building and replays with a new run', () => {
    useAnimationStore.getState().skip()
    expect(useAnimationStore.getState().phase).toBe('done')
    const nonce = useAnimationStore.getState().runNonce
    useAnimationStore.getState().replay()
    expect(useAnimationStore.getState().phase).toBe('running')
    expect(useAnimationStore.getState().runNonce).toBe(nonce + 1)
    useAnimationStore.getState().skip()
  })
})

describe('useRuntimeStore', () => {
  it('tracks renderer health flags', () => {
    useRuntimeStore.getState().setContextLost(true)
    expect(useRuntimeStore.getState().contextLost).toBe(true)
    useRuntimeStore.getState().setContextLost(false)
    useRuntimeStore.getState().setSceneCrashed(true)
    expect(useRuntimeStore.getState().sceneCrashed).toBe(true)
    useRuntimeStore.setState({ sceneCrashed: false })
  })
})
