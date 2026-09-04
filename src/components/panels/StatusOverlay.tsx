import type { ReactNode } from 'react'
import { MONTH_NAMES } from '@/building/monthFilter'
import { defaultDataSource } from '@/data/sources'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'
import { useRuntimeStore } from '@/state/useRuntimeStore'

function Overlay({
  title,
  body,
  action,
  dim = true,
}: {
  title: string
  body: ReactNode
  action?: ReactNode
  dim?: boolean
}) {
  return (
    <div
      role="status"
      className={`absolute inset-0 z-30 flex items-center justify-center p-6 ${
        dim ? 'bg-surface-950/80 backdrop-blur-sm' : ''
      }`}
    >
      <div className="max-w-sm rounded-lg border border-surface-700 bg-surface-900 p-4 text-center shadow-xl">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="mt-1.5 text-xs text-ink-500">{body}</div>
        {action && <div className="mt-3 flex justify-center">{action}</div>}
      </div>
    </div>
  )
}

function RetryButton() {
  return (
    <button
      type="button"
      className="rounded-md border border-surface-600 px-3 py-1.5 text-xs text-ink-300 hover:bg-surface-700"
      onClick={() => void useDataStore.getState().loadDataset(defaultDataSource())}
    >
      Try again
    </button>
  )
}

function LatestMonthButton({ iso }: { iso: string }) {
  return (
    <button
      type="button"
      className="rounded-md border border-surface-600 px-3 py-1.5 text-xs text-ink-300 hover:bg-surface-700"
      onClick={() => useFilterStore.getState().selectMonthForDate(iso)}
    >
      Go to {MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} {iso.slice(0, 4)}
    </button>
  )
}

/**
 * Covers every non-ready state (plan §33): loading, dataset failure, an empty
 * dataset after cleaning, a crashed scene, and GPU context loss. No state is
 * allowed to render as a blank viewport.
 */
export function StatusOverlay() {
  const status = useDataStore((s) => s.status)
  const error = useDataStore((s) => s.error)
  const contextLost = useRuntimeStore((s) => s.contextLost)
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)
  const displayed = useDisplayedLayout()
  // The pipeline guarantees chronological days, so the last one names the most
  // recent month that actually has reviews.
  const days = useDataStore((s) => s.dataset?.days)
  const latest = days && days.length > 0 ? days[days.length - 1].date : null

  if (contextLost) {
    return (
      <Overlay
        title="Graphics context lost"
        body="The browser released the GPU context — usually after a sleep or a driver reset. It should restore automatically; reload the page if it does not."
        action={
          <button
            type="button"
            className="rounded-md border border-surface-600 px-3 py-1.5 text-xs text-ink-300 hover:bg-surface-700"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        }
      />
    )
  }

  // A month with no reviews is a normal state of the slicer, not an error.
  if (status === 'ready' && month !== null && displayed && displayed.floors.length === 0) {
    return (
      <Overlay
        dim={false}
        title={`No data in ${MONTH_NAMES[month - 1]} ${year ?? ''}`}
        body="No food reviews were recorded in this month. Pick another month on the slider below."
        action={latest ? <LatestMonthButton iso={latest} /> : undefined}
      />
    )
  }

  switch (status) {
    case 'idle':
    case 'loading':
      return <Overlay title="Loading dataset…" body="Reading and validating food review records." />
    case 'error':
      return (
        <Overlay
          title="Could not load the dataset"
          body={error ?? 'Unknown error.'}
          action={<RetryButton />}
        />
      )
    case 'empty':
      return (
        <Overlay
          title="No usable records"
          body="The dataset loaded, but no valid review rows survived validation, so there is nothing to build. Check the data-quality report for details."
          action={<RetryButton />}
        />
      )
    default:
      return null
  }
}
