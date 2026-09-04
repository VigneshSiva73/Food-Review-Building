import { useEffect, useRef } from 'react'
import { visibleFloorCount } from '@/building/monthFilter'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useAnimationStore } from '@/state/useAnimationStore'
import { useFilterStore } from '@/state/useFilterStore'
import { indexedRef } from '@/types/selection'
import { useSelectionStore } from '@/state/useSelectionStore'
import { prefersReducedMotion } from '@/utils/motion'

/**
 * Glue for the slicer filter:
 * - switching month/year replays the construction intro, so each month's
 *   building assembles itself ("feels like the building is built");
 * - lowering the day slider below the selected floor clears the selection.
 * (Filter changes clear stale selections synchronously in the filter store
 * itself, so programmatic cross-month selections are not wiped here.)
 */
export function useMonthTransition() {
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)
  const dayLimit = useFilterStore((s) => s.dayLimit)
  const layout = useDisplayedLayout()

  const previousKey = useRef<string | null>(null)

  useEffect(() => {
    const key = `${year}:${month}`
    const isFirst = previousKey.current === null
    if (previousKey.current === key) return
    previousKey.current = key
    if (isFirst) return // the initial intro already runs on load

    if (layout && layout.floors.length > 0 && !prefersReducedMotion()) {
      useAnimationStore.getState().replay()
    }
  }, [year, month, layout])

  useEffect(() => {
    const { selected, clear } = useSelectionStore.getState()
    const at = indexedRef(selected)
    // A whole-tower selection is never sliced away by the day slider: it is
    // the month, not a floor of it.
    if (!at || !layout) return
    if (at.floorIndex >= visibleFloorCount(layout.floors, dayLimit)) clear()
  }, [dayLimit, layout])
}
