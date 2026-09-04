import { resolveSelection, weekdayName } from '@/building/selection'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useSelectionStore } from '@/state/useSelectionStore'
import { isoToDisplay, weekdayOfISO } from '@/utils/date'

/**
 * Screen-reader announcement of the current selection (plan §34). Tracks the
 * committed selection only — hovering must not chatter — so the 3D content
 * stays fully explorable with the keyboard alone.
 */
export function SelectionAnnouncer() {
  const layout = useDisplayedLayout()
  const selected = useSelectionStore((s) => s.selected)
  const info = layout ? resolveSelection(layout, selected) : null

  let message = ''
  // Same reason as `SelectionCard`: the crown and its ribs are hover targets,
  // never selections, so there is nothing here to announce for them.
  if (info && info.kind !== 'building' && info.kind !== 'meal' && layout) {
    const total = layout.floors.length
    {
      const { floor } = info
      const where = `floor ${floor.floorIndex + 1} of ${total}, ${weekdayName(weekdayOfISO(floor.date))} ${isoToDisplay(floor.date)}`
      if (info.kind === 'pillar') {
        const m = info.pillar.meta
        message = m.isData
          ? `Selected ${m.mealType} on ${where}. Rating ${m.rating?.toFixed(3)} out of 5, vendor ${m.vendor}.`
          : `Selected the ${m.mealType} corner on ${where}. No rating recorded — a support post stands here.`
      } else {
        const meals = floor.pillars
          .filter((p) => p.meta.isData)
          .map((p) => `${p.mealType} ${p.meta.rating?.toFixed(3)}`)
          .join(', ')
        message = `Selected ${where}. Ratings: ${meals}.`
      }
    }
  }

  return (
    <div aria-live="polite" className="sr-only">
      {message}
    </div>
  )
}
