import { useEffect } from 'react'
import { buildLayout } from '@/building'
import { defaultDataSource } from '@/data/sources'
import { syntheticDataset } from '@/data/synthetic'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'

/**
 * Loads the bundled CSV once on mount (idempotent under StrictMode).
 * `?days=N` (1–2000) swaps in a deterministic synthetic dataset of N valid
 * days for performance profiling (plan §32).
 */
export function useDatasetLoader() {
  const status = useDataStore((s) => s.status)
  const loadDataset = useDataStore((s) => s.loadDataset)

  useEffect(() => {
    if (useDataStore.getState().status !== 'idle') return

    const daysParam = Number(new URLSearchParams(window.location.search).get('days'))
    if (Number.isInteger(daysParam) && daysParam > 0 && daysParam <= 2000) {
      console.info(`[data] synthetic profiling dataset: ${daysParam} days`)
      const dataset = syntheticDataset(daysParam)
      useFilterStore.getState().initialiseFrom(dataset.days)
      useDataStore.setState({ status: 'ready', dataset, layout: buildLayout(dataset.days) })
      return
    }

    void loadDataset(defaultDataSource())
  }, [loadDataset])

  return status
}
