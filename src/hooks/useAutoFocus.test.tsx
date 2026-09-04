// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'
import { useAutoFocus } from './useAutoFocus'

function Harness() {
  useAutoFocus()
  return null
}

beforeEach(() => {
  useSelectionStore.getState().clear()
  useViewStore.setState({ focusRequest: null })
  render(<Harness />)
})

afterEach(cleanup)

describe('useAutoFocus', () => {
  it('flies to a pillar the moment it is selected', () => {
    const pillar = { kind: 'pillar', floorIndex: 12, corner: 1 } as const
    act(() => useSelectionStore.getState().select(pillar))
    expect(useViewStore.getState().focusRequest?.ref).toEqual(pillar)
  })

  it('also fires for selections made from the panels', () => {
    // "Best day" links call the same store action the 3D view does.
    act(() => useSelectionStore.getState().select({ kind: 'floor', floorIndex: 4 }))
    expect(useViewStore.getState().focusRequest?.ref).toEqual({ kind: 'floor', floorIndex: 4 })
  })

  it('re-focuses when the same target is picked again', () => {
    const ref = { kind: 'floor', floorIndex: 4 } as const
    act(() => useSelectionStore.getState().select({ ...ref }))
    const first = useViewStore.getState().focusRequest!.nonce
    act(() => useSelectionStore.getState().select({ ...ref }))
    expect(useViewStore.getState().focusRequest!.nonce).toBeGreaterThan(first)
  })

  it('leaves the camera alone when the selection is cleared', () => {
    act(() => useSelectionStore.getState().select({ kind: 'floor', floorIndex: 4 }))
    const afterSelect = useViewStore.getState().focusRequest!.nonce
    act(() => useSelectionStore.getState().clear())
    expect(useViewStore.getState().focusRequest!.nonce).toBe(afterSelect)
  })

  it('ignores hover, which must never move the camera', () => {
    act(() => useSelectionStore.getState().setHovered({ kind: 'pillar', floorIndex: 9, corner: 0 }))
    expect(useViewStore.getState().focusRequest).toBeNull()
  })
})
