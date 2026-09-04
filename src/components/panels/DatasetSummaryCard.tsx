import { useDataStore } from '@/state/useDataStore'
import { isoToDisplay } from '@/utils/date'

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tnum font-medium">{value}</dd>
    </div>
  )
}

/** Dataset overview — every number comes straight from the pipeline stats. */
export function DatasetSummaryCard() {
  const dataset = useDataStore((s) => s.dataset)
  if (!dataset) return null
  const s = dataset.stats

  return (
    <dl className="space-y-1.5 text-sm">
      <Row label="Days (floors)" value={s.totalDays} />
      <Row label="Meal records" value={s.totalRecords} />
      <Row label="Duplicates removed" value={s.duplicatesRemoved} />
      <Row label="Conflicts resolved" value={s.conflictsResolved} />
      {s.invalidRowsDropped > 0 && <Row label="Invalid rows dropped" value={s.invalidRowsDropped} />}
      {s.dateRange && (
        <Row
          label="Range"
          value={`${isoToDisplay(s.dateRange.start)} – ${isoToDisplay(s.dateRange.end)}`}
        />
      )}
    </dl>
  )
}
