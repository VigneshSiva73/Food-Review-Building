import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { uiConfig } from '@/config'

const SNAPS = [
  uiConfig.mobile.sheetPeekFraction,
  uiConfig.mobile.sheetHalfFraction,
  uiConfig.mobile.sheetFullFraction,
].map((f) => f * 100)

const SNAP_NAMES = ['peek', 'half', 'full'] as const

function nearestSnap(pct: number): number {
  let best = 0
  for (let i = 1; i < SNAPS.length; i++) {
    if (Math.abs(SNAPS[i] - pct) < Math.abs(SNAPS[best] - pct)) best = i
  }
  return best
}

/**
 * Mobile information sheet (plan §31): drag the grip to resize between peek,
 * half, and full, or activate it from the keyboard to cycle those snap
 * points. Heights are percentages of the viewport area, so no measurement is
 * needed and rotation is handled for free.
 */
export function BottomSheet({
  label,
  expandTrigger,
  children,
}: {
  label: string
  /**
   * Whenever this changes to something non-null the sheet opens at least to
   * the half snap — otherwise a tap selects something the user cannot see
   * behind the collapsed sheet.
   */
  expandTrigger?: unknown
  children: ReactNode
}) {
  const [snapIndex, setSnapIndex] = useState(0)
  const [dragPct, setDragPct] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startPct: number; height: number } | null>(null)

  const [seenTrigger, setSeenTrigger] = useState(expandTrigger)
  if (expandTrigger !== seenTrigger) {
    setSeenTrigger(expandTrigger)
    if (expandTrigger != null) setSnapIndex((i) => Math.max(i, 1))
  }

  const heightPct = dragPct ?? SNAPS[snapIndex]

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const host = e.currentTarget.closest('aside')?.parentElement
    if (!host) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, startPct: heightPct, height: host.clientHeight }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const deltaPct = ((d.startY - e.clientY) / d.height) * 100
    setDragPct(Math.min(SNAPS[2], Math.max(6, d.startPct + deltaPct)))
  }

  const endDrag = () => {
    if (!drag.current) return
    if (dragPct !== null) setSnapIndex(nearestSnap(dragPct))
    drag.current = null
    setDragPct(null)
  }

  const cycle = () => {
    // Only treat it as a tap when no drag took place.
    if (drag.current === null && dragPct === null) {
      setSnapIndex((i) => (i + 1) % SNAPS.length)
    }
  }

  return (
    <aside
      aria-label={label}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-xl border-t border-surface-700 bg-surface-900 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]"
      style={{
        height: `${heightPct}%`,
        transition: dragPct === null ? 'height 220ms ease' : undefined,
      }}
    >
      <button
        type="button"
        aria-label={`Resize information panel (currently ${SNAP_NAMES[snapIndex]})`}
        className="flex w-full shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={cycle}
      >
        <span className="h-1 w-10 rounded-full bg-surface-600" aria-hidden />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </aside>
  )
}
