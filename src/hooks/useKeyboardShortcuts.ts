import { useEffect } from 'react'
import { visibleFloorCount } from '@/building/monthFilter'
import { getDisplayedLayout } from '@/state/displayedLayout'
import { indexedRef } from '@/types/selection'
import { useFilterStore } from '@/state/useFilterStore'
import { useRuntimeStore } from '@/state/useRuntimeStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'

/**
 * Global shortcuts (plan §§27, 34):
 *   Esc      — clear selection or exit full 3D mode
 *   R        — reset camera to the fit pose
 *   F        — focus the camera on the selected floor
 *   ↑ / ↓    — step through floors (keyboard-explorable 3D content)
 * Skipped while focus is in a form control.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (e.key === 'Escape') {
        const fullMode = useRuntimeStore.getState().fullMode
        if (fullMode) {
          useRuntimeStore.getState().setFullMode(false)
          return
        }
        useSelectionStore.getState().clear()
        return
      }

      if (e.key === 'r' || e.key === 'R') {
        useViewStore.getState().requestCameraReset()
        return
      }

      if (e.key === 'f' || e.key === 'F') {
        const { selected } = useSelectionStore.getState()
        if (selected) useViewStore.getState().requestFocus(selected)
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Step within the displayed building, capped by the day slider.
        const floors = getDisplayedLayout()?.floors ?? []
        const floorCount = visibleFloorCount(floors, useFilterStore.getState().dayLimit)
        if (floorCount === 0) return
        e.preventDefault()
        const { selected, select } = useSelectionStore.getState()
        const delta = e.key === 'ArrowUp' ? 1 : -1
        // A whole-tower selection has no floor to step from, so the arrows
        // start at the end they would start at with nothing selected.
        const from = indexedRef(selected)
        const current = from ? from.floorIndex : delta > 0 ? -1 : floorCount
        const next = Math.min(floorCount - 1, Math.max(0, current + delta))
        select({ kind: 'floor', floorIndex: next })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
