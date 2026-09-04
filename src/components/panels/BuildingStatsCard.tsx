import { useMemo } from 'react'
import { ChevronIcon } from '@/components/ui/icons'
import { MEAL_TYPES, type MealType } from '@/types'
import { displayedLayout } from '@/state/displayedLayout'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { isoToDisplay } from '@/utils/date'

const MEAL_CHIP: Record<MealType, string> = {
  Breakfast: 'bg-meal-breakfast',
  Lunch: 'bg-meal-lunch',
  Dinner: 'bg-meal-dinner',
}

interface Extreme {
  date: string
  mealType: MealType
  rating: number
}

/** Full-width hover target: reads as actionable without a raw underline. */
function LinkRow({
  label,
  text,
  onClick,
}: {
  label: string
  text: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/row -mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-700/50"
    >
      <span className="text-ink-500">{label}</span>
      <span className="flex items-center gap-1">
        <span className="tnum group-hover/row:text-accent-400">{text}</span>
        <ChevronIcon className="h-3 w-3 text-accent-400 opacity-0 transition-opacity group-hover/row:opacity-100" />
      </span>
    </button>
  )
}

/**
 * Building-level statistics. Best/worst rows are buttons that select the
 * matching floor/pillar in the 3D scene — the panel drives the scene just as
 * the scene drives the panel (plan §30).
 */
export function BuildingStatsCard() {
  const dataset = useDataStore((s) => s.dataset)
  const layout = useDataStore((s) => s.layout)
  const select = useSelectionStore((s) => s.select)

  const extremes = useMemo(() => {
    if (!dataset) return null
    let highest: Extreme | null = null
    let lowest: Extreme | null = null
    for (const day of dataset.days) {
      for (const meal of MEAL_TYPES) {
        const r = day.meals[meal]
        if (!r) continue
        if (!highest || r.rating > highest.rating) {
          highest = { date: day.date, mealType: meal, rating: r.rating }
        }
        if (!lowest || r.rating < lowest.rating) {
          lowest = { date: day.date, mealType: meal, rating: r.rating }
        }
      }
    }
    return { highest, lowest }
  }, [dataset])

  if (!dataset || !layout) return null
  const s = dataset.stats

  /**
   * The linked date may live in a different month than the one on screen:
   * switch the slicer filter first, then resolve the floor in the layout that
   * will actually be displayed.
   */
  const floorFor = (date: string) => {
    const filter = useFilterStore.getState()
    filter.selectMonthForDate(date)
    const { year, month } = useFilterStore.getState()
    const shown = displayedLayout(dataset, layout, year, month)
    return shown?.floors.find((f) => f.date === date) ?? null
  }
  const selectDay = (date: string) => {
    const floor = floorFor(date)
    if (floor) select({ kind: 'floor', floorIndex: floor.floorIndex })
  }
  const selectMeal = (e: Extreme) => {
    const floor = floorFor(e.date)
    if (floor) {
      select({
        kind: 'pillar',
        floorIndex: floor.floorIndex,
        corner: MEAL_TYPES.indexOf(e.mealType) as 0 | 1 | 2,
      })
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        {MEAL_TYPES.map((meal) => (
          <div key={meal} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-ink-500">
              <span
                className={`h-2.5 w-2.5 rounded-full ring-1 ring-white/10 ${MEAL_CHIP[meal]}`}
                aria-hidden
              />
              {meal} avg
            </span>
            <span className="tnum font-medium">
              {s.perMeal[meal].count > 0 ? s.perMeal[meal].average.toFixed(3) : '—'}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-surface-700/70 pt-2">
        {s.bestDay && (
          <LinkRow
            label="Best day"
            text={`${isoToDisplay(s.bestDay.date)} · ${s.bestDay.average.toFixed(3)}`}
            onClick={() => selectDay(s.bestDay!.date)}
          />
        )}
        {s.worstDay && (
          <LinkRow
            label="Worst day"
            text={`${isoToDisplay(s.worstDay.date)} · ${s.worstDay.average.toFixed(3)}`}
            onClick={() => selectDay(s.worstDay!.date)}
          />
        )}
        {extremes?.highest && (
          <LinkRow
            label="Tallest pillar"
            text={`${extremes.highest.mealType} ${isoToDisplay(extremes.highest.date)} · ${extremes.highest.rating.toFixed(3)}`}
            onClick={() => selectMeal(extremes.highest!)}
          />
        )}
        {extremes?.lowest && (
          <LinkRow
            label="Shortest pillar"
            text={`${extremes.lowest.mealType} ${isoToDisplay(extremes.lowest.date)} · ${extremes.lowest.rating.toFixed(3)}`}
            onClick={() => selectMeal(extremes.lowest!)}
          />
        )}
      </div>
    </div>
  )
}
