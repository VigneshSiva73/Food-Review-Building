import { useMemo } from 'react'
import { daysInCalendarMonth } from '@/building/monthFilter'
import { StepSlider, type StepTick } from '@/components/ui/StepSlider'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useFilterStore } from '@/state/useFilterStore'

const TRACK_PX = 220

/**
 * Vertical layer slider: caps the visible floors of the selected month at a
 * day of the month, the way a slicer caps printed layers. Only shown once a
 * month is chosen, and only when that month has a building to slice.
 */
export function DaySlider() {
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)
  const dayLimit = useFilterStore((s) => s.dayLimit)
  const setDayLimit = useFilterStore((s) => s.setDayLimit)
  const layout = useDisplayedLayout()
  const mode = useResponsiveLayout()

  const maxDay = useMemo(
    () => (month !== null && year !== null ? daysInCalendarMonth({ year, month }) : 0),
    [year, month],
  )
  const ticks = useMemo<StepTick[]>(
    () => Array.from({ length: maxDay }, (_, i) => ({ value: i + 1 })),
    [maxDay],
  )

  if (month === null || year === null || !layout || layout.floors.length === 0) return null

  const value = dayLimit ?? maxDay

  return (
    <div
      className={`pointer-events-auto absolute top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-surface-600/80 bg-surface-900/90 px-2 py-3 backdrop-blur-md ${
        mode === 'mobile' ? 'left-2' : 'right-4'
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.05), 0 18px 40px rgb(0 0 0 / 0.45)' }}
    >
      <span className="tnum text-[10px] text-ink-500">{maxDay}</span>
      <StepSlider
        orientation="vertical"
        lengthPx={TRACK_PX}
        min={1}
        max={maxDay}
        value={value}
        ticks={ticks}
        label="Show floors up to day of month"
        valueText={`Day ${value} of ${maxDay}`}
        // Sliding to the top means "the whole month", not a cap on the last day.
        onChange={(v) => setDayLimit(v >= maxDay ? null : v)}
      />
      <span className="tnum text-[10px] text-ink-500">1</span>
      <span className="tnum rounded-md bg-surface-800 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-ink-300">
        Day {value}
      </span>
    </div>
  )
}
