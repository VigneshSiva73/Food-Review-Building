import { useMemo } from 'react'
import { availableYears, monthHasData, MONTH_NAMES, MONTH_SHORT } from '@/building/monthFilter'
import { StepSlider, type StepTick } from '@/components/ui/StepSlider'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'

/** Half the slider thumb, so labels align with the notches (see StepSlider). */
const THUMB_RADIUS_PX = 8
const FIRST_MONTH = 1
const LAST_MONTH = 12

/**
 * Bottom slicer control: Jan–Dec for the selected year, each month rendering
 * as its own building. Months without reviews stay selectable and show the
 * No-data state. The year is a separate dropdown beside it, because a dataset
 * spanning several years needs two independent axes — sliding through months
 * should never silently change the year.
 */
export function MonthSlider() {
  const days = useDataStore((s) => s.dataset?.days ?? null)
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)
  const setYear = useFilterStore((s) => s.setYear)
  const setMonth = useFilterStore((s) => s.setMonth)
  const mode = useResponsiveLayout()

  const years = useMemo(() => (days ? availableYears(days) : []), [days])
  const activeYear = year ?? years[years.length - 1] ?? null

  const hasData = useMemo(
    () =>
      days && activeYear !== null
        ? MONTH_SHORT.map((_, i) => monthHasData(days, { year: activeYear, month: i + 1 }))
        : MONTH_SHORT.map(() => false),
    [days, activeYear],
  )

  const ticks = useMemo<StepTick[]>(
    () =>
      hasData.map((present, i) => ({
        value: i + 1,
        muted: !present,
        title: present ? undefined : 'No data',
      })),
    [hasData],
  )

  if (!days || activeYear === null) return null

  const value = month ?? FIRST_MONTH
  const compact = mode === 'mobile'
  const apply = (v: number) => {
    if (year === null) setYear(activeYear)
    setMonth(v)
  }
  const labelAt = (i: number) =>
    `calc(${THUMB_RADIUS_PX}px + (100% - ${THUMB_RADIUS_PX * 2}px) * ${i / (LAST_MONTH - FIRST_MONTH)})`

  const stops = compact ? MONTH_SHORT.map((m) => m[0]) : MONTH_SHORT

  return (
    <div
      className={`pointer-events-auto absolute left-1/2 z-10 w-[min(94%,40rem)] -translate-x-1/2 rounded-2xl border border-surface-600/80 bg-surface-900/90 px-4 pt-3 pb-2 shadow-2xl shadow-black/40 backdrop-blur-md ${
        compact ? 'bottom-[21%]' : 'bottom-4'
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.05), 0 18px 40px rgb(0 0 0 / 0.45)' }}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tracking-tight text-ink-100">
          {MONTH_NAMES[value - 1]}
        </span>
        <select
          aria-label="Year"
          className="tnum rounded-md border border-surface-600 bg-surface-800 px-1.5 py-0.5 text-xs text-ink-300"
          value={activeYear}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <StepSlider
        min={FIRST_MONTH}
        max={LAST_MONTH}
        value={value}
        onChange={apply}
        ticks={ticks}
        label="Month"
        valueText={`${MONTH_NAMES[value - 1]} ${activeYear}`}
      />

      <div className="relative mt-1 h-4">
        {stops.map((name, i) => {
          const selected = i + 1 === value
          const empty = !hasData[i]
          return (
            <button
              key={MONTH_SHORT[i]}
              type="button"
              title={empty ? 'No data' : undefined}
              onClick={() => apply(i + 1)}
              style={{ left: labelAt(i) }}
              className={`absolute top-0 -translate-x-1/2 rounded px-1 text-[10px] leading-4 transition-colors ${
                selected
                  ? 'font-semibold text-accent-400'
                  : empty
                    ? 'text-ink-500/45 hover:text-ink-500'
                    : 'text-ink-500 hover:text-ink-100'
              }`}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
