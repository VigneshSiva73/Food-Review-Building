import { ChevronIcon } from '@/components/ui/icons'
import { useDataStore } from '@/state/useDataStore'

const MAX_SHOWN = 50

/** Data-quality report, collapsed by default (plan §30). */
export function IssuesCard() {
  const dataset = useDataStore((s) => s.dataset)
  if (!dataset) return null
  const { issues } = dataset

  if (issues.length === 0) {
    return <p className="text-sm text-ink-500">No data-quality issues found.</p>
  }

  return (
    <details className="group text-sm">
      <summary className="marker-none flex cursor-pointer items-center gap-1.5 select-none text-ink-300 [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="text-ink-500 transition-transform duration-150 group-open:rotate-90" />
        <span className="tnum rounded-md bg-surface-700 px-1.5 py-0.5 text-[11px] font-medium">
          {issues.length}
        </span>
        issue{issues.length === 1 ? '' : 's'} found &amp; handled
      </summary>
      <ul className="thin-scroll mt-2.5 max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {issues.slice(0, MAX_SHOWN).map((issue, i) => (
          <li key={i} className="text-xs">
            <span className="rounded bg-surface-700 px-1 py-0.5 font-mono">{issue.type}</span>{' '}
            <span className="text-ink-500">{issue.message}</span>
          </li>
        ))}
        {issues.length > MAX_SHOWN && (
          <li className="text-xs text-ink-500">…and {issues.length - MAX_SHOWN} more</li>
        )}
      </ul>
    </details>
  )
}
