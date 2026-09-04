import { MEAL_TYPES, type FloorLayout, type PillarLayout } from '@/types'
import { resolveSelection, weekdayName } from '@/building/selection'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useViewStore } from '@/state/useViewStore'
import { isoToDisplay, weekdayOfISO } from '@/utils/date'

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-surface-600 bg-surface-800 px-1.5 py-0.5 font-sans text-[10px] font-medium text-ink-300">
      {children}
    </kbd>
  )
}

function MealRow({ pillar, floor }: { pillar: PillarLayout; floor: FloorLayout }) {
  const select = useSelectionStore((s) => s.select)
  const { meta } = pillar
  return (
    <button
      type="button"
      className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-700/60"
      onClick={() =>
        select({ kind: 'pillar', floorIndex: floor.floorIndex, corner: pillar.corner })
      }
    >
      <span className="text-ink-500">{meta.mealType}</span>
      {meta.isData ? (
        <span>
          {meta.rating?.toFixed(3)} <span className="text-ink-500">· {meta.vendor}</span>
        </span>
      ) : (
        <span className="text-ink-500 italic">
          {pillar.mealType === 'Dinner' ? 'No dinner service (Saturday)' : 'No data recorded'}
        </span>
      )}
    </button>
  )
}

function FloorHeader({ floor }: { floor: FloorLayout }) {
  const select = useSelectionStore((s) => s.select)
  const floorCount = useDisplayedLayout()?.floors.length ?? 0

  const step = (delta: number) => {
    const next = floor.floorIndex + delta
    if (next >= 0 && next < floorCount) select({ kind: 'floor', floorIndex: next })
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        className="text-left text-xs text-ink-500 hover:text-accent-400"
        onClick={() => select({ kind: 'floor', floorIndex: floor.floorIndex })}
        title="Select the whole floor"
      >
        Floor {floor.floorIndex + 1} · {weekdayName(weekdayOfISO(floor.date))}{' '}
        {isoToDisplay(floor.date)}
      </button>
      <span className="flex gap-1">
        <button
          type="button"
          aria-label="Previous floor"
          className="rounded bg-surface-700 px-1.5 text-xs hover:bg-surface-600 disabled:opacity-40"
          disabled={floor.floorIndex === 0}
          onClick={() => step(-1)}
        >
          ↓
        </button>
        <button
          type="button"
          aria-label="Next floor"
          className="rounded bg-surface-700 px-1.5 text-xs hover:bg-surface-600 disabled:opacity-40"
          disabled={floor.floorIndex >= floorCount - 1}
          onClick={() => step(1)}
        >
          ↑
        </button>
      </span>
    </div>
  )
}

/**
 * Full detail for the committed selection (plan §§17, 27, 30). Hover is served
 * by HoverTooltip instead, so this panel stays put while the pointer moves.
 * Ratings appear here and only here — never on geometry. Rows are buttons: the
 * panel drives the 3D selection just as the scene does.
 */
export function SelectionCard() {
  const layout = useDisplayedLayout()
  const selected = useSelectionStore((s) => s.selected)
  const select = useSelectionStore((s) => s.select)

  if (!layout) return null
  // Hover is handled by the cursor tooltip; the panel holds the committed
  // selection so it stays readable while the pointer sweeps the building.
  const info = resolveSelection(layout, selected)

  if (!info) {
    return (
      <div className="space-y-2.5">
        <p className="text-xs leading-relaxed text-ink-500">
          Click a pillar, floor, or dark leave band to inspect it. Hovering shows a quick
          summary beside the cursor.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-500">
          <span className="flex items-center gap-1">
            <Key>↑</Key>
            <Key>↓</Key> floors
          </span>
          <span className="flex items-center gap-1">
            <Key>F</Key> focus
          </span>
          <span className="flex items-center gap-1">
            <Key>R</Key> reset
          </span>
          <span className="flex items-center gap-1">
            <Key>Esc</Key> clear
          </span>
        </div>
      </div>
    )
  }

  const actions = selected && (
    <div className="mt-1 flex gap-2">
      <button
        type="button"
        className="rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
        onClick={() => selected && useViewStore.getState().requestFocus(selected)}
      >
        Focus camera (F)
      </button>
      <button
        type="button"
        className="rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
        onClick={() => select(null)}
      >
        Clear (Esc)
      </button>
    </div>
  )
  const clearButton = actions || (selected && (
    <button
      type="button"
      className="mt-1 rounded bg-surface-700 px-2 py-0.5 text-xs hover:bg-surface-600"
      onClick={() => select(null)}
    >
      Clear (Esc)
    </button>
  ))

  // The crown is a HOVER target only — it reports the month beside the cursor
  // and never becomes a selection — so this panel has nothing to add for it or
  // for one of its ribs. Handled explicitly rather than left to fall through,
  // where it would read `info.floor` off something that has no floor.
  if (info.kind === 'building' || info.kind === 'meal') return null

  if (info.kind === 'pillar') {
    return (
      <div className="space-y-2 text-sm">
        <FloorHeader floor={info.floor} />
        <MealRow pillar={info.pillar} floor={info.floor} />
        {clearButton}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-sm">
      <FloorHeader floor={info.floor} />
      <div className="space-y-0.5">
        {MEAL_TYPES.map((meal) => {
          const pillar = info.floor.pillars.find((p) => p.mealType === meal)
          return pillar ? <MealRow key={meal} pillar={pillar} floor={info.floor} /> : null
        })}
      </div>
      {clearButton}
    </div>
  )
}
