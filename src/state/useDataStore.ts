import { create } from 'zustand'
import type { BuildingLayout, Dataset } from '@/types'
import type { DataSource } from '@/data/sources/DataSource'
import { buildLayout } from '@/building'
import { runPipeline } from '@/data/pipeline'
import { useFilterStore } from './useFilterStore'

export type DataStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

interface DataState {
  status: DataStatus
  dataset: Dataset | null
  /** Derived building layout, rebuilt whenever the dataset changes. */
  layout: BuildingLayout | null
  error: string | null
  loadDataset: (source: DataSource) => Promise<void>
}

export const useDataStore = create<DataState>((set) => ({
  status: 'idle',
  dataset: null,
  layout: null,
  error: null,

  async loadDataset(source) {
    set({ status: 'loading', error: null })
    try {
      const text = await source.fetchText()
      const dataset = runPipeline(text)

      if (import.meta.env.DEV && dataset.issues.length > 0) {
        console.groupCollapsed(
          `[data] ${dataset.issues.length} data-quality issue(s) in ${source.label}`,
        )
        for (const issue of dataset.issues) {
          console.warn(`[${issue.type}]${issue.row != null ? ` row ${issue.row}` : ''} ${issue.message}`)
        }
        console.groupEnd()
      }
      if (import.meta.env.DEV) {
        const s = dataset.stats
        console.info(
          `[data] ${s.totalDays} days, ${s.totalRecords} records ` +
            `(${s.duplicatesRemoved} duplicates removed, ${s.conflictsResolved} conflicts resolved)`,
        )
      }

      // Set the filter first: there is no all-months view, so a render with a
      // dataset but no chosen month would have nothing to show.
      useFilterStore.getState().initialiseFrom(dataset.days)
      set({
        status: dataset.days.length === 0 ? 'empty' : 'ready',
        dataset,
        layout: buildLayout(dataset.days),
      })
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
