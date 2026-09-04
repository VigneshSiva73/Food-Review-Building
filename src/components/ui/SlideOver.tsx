import { useEffect, type ReactNode } from 'react'
import { uiConfig } from '@/config'

/**
 * Tablet information panel (plan §31): slides over the viewport instead of
 * competing with it for width. Esc closes it, matching the backdrop tap.
 */
export function SlideOver({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean
  label: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close information panel"
          tabIndex={-1}
          className="absolute inset-0 z-10 bg-black/40"
          onClick={onClose}
        />
      )}
      <aside
        aria-label={label}
        aria-hidden={!open}
        inert={!open}
        className="absolute inset-y-0 right-0 z-20 flex max-w-[85%] flex-col border-l border-surface-700 bg-surface-900 shadow-2xl transition-transform duration-200"
        style={{
          width: uiConfig.sidePanelWidthPx,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-surface-700 px-3 py-2">
          <h2 className="text-xs font-semibold tracking-wide text-ink-300 uppercase">Details</h2>
          <button
            type="button"
            aria-label="Close information panel"
            className="rounded px-2 py-1 text-sm text-ink-300 hover:bg-surface-700"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  )
}
