import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveSelection, tooltipText } from '@/building/selection'
import { useAnimationStore } from '@/state/useAnimationStore'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useSelectionStore } from '@/state/useSelectionStore'

const CURSOR_OFFSET = 16
const EDGE_MARGIN = 8

function canHover(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(hover: hover)').matches
}

/**
 * Compact summary of whatever the pointer is over, following the cursor.
 *
 * Position is written straight to the element's transform inside the
 * pointermove listener — no React state per move, so sweeping the tower
 * costs no re-renders. The element stays mounted and fades instead of
 * unmounting, which keeps that listener alive.
 */
export function HoverTooltip() {
  const hovered = useSelectionStore((s) => s.hovered)
  const layout = useDisplayedLayout()
  const constructing = useAnimationStore((s) => s.phase) === 'running'
  const ref = useRef<HTMLDivElement>(null)
  const [pressed, setPressed] = useState(false)
  const hoverCapable = useMemo(() => canHover(), [])

  const text = tooltipText(layout ? resolveSelection(layout, hovered) : null)
  // Hidden while dragging so it never fights with orbiting the camera.
  const visible = text !== null && hoverCapable && !constructing && !pressed

  useEffect(() => {
    const el = ref.current
    const host = el?.parentElement
    if (!el || !host) return

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      // Flip to the other side of the cursor near the right/bottom edges.
      const x =
        localX + CURSOR_OFFSET + el.offsetWidth > rect.width - EDGE_MARGIN
          ? localX - CURSOR_OFFSET - el.offsetWidth
          : localX + CURSOR_OFFSET
      const y =
        localY + CURSOR_OFFSET + el.offsetHeight > rect.height - EDGE_MARGIN
          ? localY - CURSOR_OFFSET - el.offsetHeight
          : localY + CURSOR_OFFSET
      el.style.transform = `translate3d(${Math.max(EDGE_MARGIN, x)}px, ${Math.max(EDGE_MARGIN, y)}px, 0)`
    }
    const onDown = () => setPressed(true)
    const onUp = () => setPressed(false)

    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute top-0 left-0 z-[25] max-w-[16rem] rounded-md border border-surface-700 bg-surface-900/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm transition-opacity duration-100 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <p className="text-xs font-medium text-ink-100">{text?.title ?? ''}</p>
      <p className="text-[11px] text-ink-500">{text?.subtitle ?? ''}</p>
      {/*
        Only the whole-building summary carries these. A floor or a pillar
        stays two lines, because a card that grows while the pointer is still
        moving is harder to read than a smaller one that does not.
      */}
      {text?.details && (
        <ul className="mt-1 space-y-0.5 border-t border-surface-700 pt-1">
          {text.details.map((line) => (
            <li key={line} className="text-[11px] text-ink-300">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
