// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildLayout } from '@/building'
import { syntheticDataset } from '@/data/synthetic'
import { useDataStore } from '@/state/useDataStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

function Harness() {
  useKeyboardShortcuts()
  return <input aria-label="text field" />
}

const press = (key: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

beforeEach(() => {
  const dataset = syntheticDataset(5)
  useDataStore.setState({ status: 'ready', dataset, layout: buildLayout(dataset.days) })
  useSelectionStore.getState().clear()
  render(<Harness />)
})

afterEach(cleanup)

describe('useKeyboardShortcuts', () => {
  it('clears the selection on Escape', () => {
    useSelectionStore.getState().select({ kind: 'floor', floorIndex: 2 })
    press('Escape')
    expect(useSelectionStore.getState().selected).toBeNull()
  })

  it('requests a camera reset on R, in either case', () => {
    const before = useViewStore.getState().resetSignal
    press('r')
    press('R')
    expect(useViewStore.getState().resetSignal).toBe(before + 2)
  })

  it('focuses the selected floor on F, and ignores F with nothing selected', () => {
    const before = useViewStore.getState().focusRequest?.nonce ?? 0
    press('f')
    expect(useViewStore.getState().focusRequest?.nonce ?? 0).toBe(before)

    const pillar = { kind: 'pillar', floorIndex: 3, corner: 0 } as const
    useSelectionStore.getState().select(pillar)
    press('f')
    // The whole ref travels, so the camera can frame that one pillar.
    expect(useViewStore.getState().focusRequest?.ref).toEqual(pillar)
  })

  it('steps up and down through floors', () => {
    press('ArrowUp')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 0 })
    press('ArrowUp')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 1 })
    press('ArrowDown')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 0 })
  })

  it('clamps stepping at both ends of the building', () => {
    useSelectionStore.getState().select({ kind: 'floor', floorIndex: 0 })
    press('ArrowDown')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 0 })

    useSelectionStore.getState().select({ kind: 'floor', floorIndex: 4 })
    press('ArrowUp')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 4 })
  })

  it('enters the building from the top when stepping down with nothing selected', () => {
    press('ArrowDown')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 4 })
  })

  it('stays out of the way while the user is typing', () => {
    useSelectionStore.getState().select({ kind: 'floor', floorIndex: 2 })
    const input = document.querySelector('input')!
    press('Escape', input)
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'floor', floorIndex: 2 })
  })
})
