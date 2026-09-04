import { buildLayout } from '@/building'
import { daysForMonth } from '@/building/monthFilter'
import type { BuildingLayout, Dataset } from '@/types'
import { useDataStore } from './useDataStore'
import { useFilterStore } from './useFilterStore'

/**
 * The layout currently on screen: one month's standalone building. Memoized
 * on its inputs with referential stability, so React memos and the
 * construction registry see one object per
 * (dataset, year, month) — every consumer resolves selection floorIndexes
 * against the same building.
 */

let memo: {
  dataset: Dataset
  year: number | null
  month: number | null
  layout: BuildingLayout
} | null = null

export function displayedLayout(
  dataset: Dataset | null,
  fullLayout: BuildingLayout | null,
  year: number | null,
  month: number | null,
): BuildingLayout | null {
  if (!dataset || !fullLayout) return null
  // Only reachable before `initialiseFrom` has landed the opening month, which
  // happens in the same tick the dataset arrives — never during normal display.
  if (month === null || year === null) return fullLayout

  if (memo && memo.dataset === dataset && memo.year === year && memo.month === month) {
    return memo.layout
  }
  const layout = buildLayout(daysForMonth(dataset.days, { year, month }))
  memo = { dataset, year, month, layout }
  return layout
}

/** Snapshot accessor for event handlers (keyboard, stats links). */
export function getDisplayedLayout(): BuildingLayout | null {
  const { dataset, layout } = useDataStore.getState()
  const { year, month } = useFilterStore.getState()
  return displayedLayout(dataset, layout, year, month)
}

/** The building currently displayed, for every layout consumer. */
export function useDisplayedLayout(): BuildingLayout | null {
  const dataset = useDataStore((s) => s.dataset)
  const fullLayout = useDataStore((s) => s.layout)
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)
  return displayedLayout(dataset, fullLayout, year, month)
}
