import { useState, type ReactNode } from 'react'
import { uiConfig } from '@/config'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SlideOver } from '@/components/ui/SlideOver'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { useDataStore } from '@/state/useDataStore'
import { useRuntimeStore } from '@/state/useRuntimeStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { isoToDisplay } from '@/utils/date'

interface AppShellProps {
  viewport: ReactNode
  panel: ReactNode
}

const PANEL_LABEL = 'Building information'

/**
 * Layout shell (plan §31). The same cards are composed three ways rather
 * than one desktop layout being shrunk: a docked panel on desktop, a
 * slide-over on tablet, and a draggable bottom sheet on mobile.
 */
export function AppShell({ viewport, panel }: AppShellProps) {
  const mode = useResponsiveLayout()
  const [sheetOpen, setSheetOpen] = useState(false)
  const selected = useSelectionStore((s) => s.selected)
  const range = useDataStore((s) => s.dataset?.stats.dateRange ?? null)
  const fullMode = useRuntimeStore((s) => s.fullMode)

  return (
    <div className="flex h-full flex-col">
      {!fullMode && (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-700 bg-surface-900 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Three bars echoing the three meal pillars. */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
              <rect x="2" y="7" width="3" height="9" rx="1" fill="var(--color-meal-breakfast)" />
              <rect x="7.5" y="3" width="3" height="13" rx="1" fill="var(--color-meal-lunch)" />
              <rect x="13" y="10" width="3" height="6" rx="1" fill="var(--color-meal-dinner)" />
            </svg>
            <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
              {uiConfig.appTitle}
            </h1>
            <p className="hidden text-xs text-ink-500 lg:block">
              Office food quality as architecture — one floor per day, one pillar per meal
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {range && (
              <span className="tnum hidden rounded-full border border-surface-700 bg-surface-800/70 px-2.5 py-1 text-[11px] text-ink-500 md:inline">
                {isoToDisplay(range.start)} – {isoToDisplay(range.end)}
              </span>
            )}
            {mode === 'tablet' && (
              <button
                type="button"
                className="rounded-md border border-surface-600 px-2.5 py-1 text-xs text-ink-300 transition-colors hover:bg-surface-700"
                onClick={() => setSheetOpen(true)}
              >
                Details
              </button>
            )}
          </div>
        </header>
      )}

      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 bg-surface-950" aria-label="3D building viewport">
          {viewport}
        </main>

        {!fullMode && mode === 'desktop' && (
          <aside
            className="thin-scroll shrink-0 overflow-y-auto border-l border-surface-700 bg-surface-900"
            style={{ width: uiConfig.sidePanelWidthPx }}
            aria-label={PANEL_LABEL}
          >
            {panel}
          </aside>
        )}

        {!fullMode && mode === 'tablet' && (
          <SlideOver open={sheetOpen} label={PANEL_LABEL} onClose={() => setSheetOpen(false)}>
            {panel}
          </SlideOver>
        )}

        {!fullMode && mode === 'mobile' && (
          <BottomSheet label={PANEL_LABEL} expandTrigger={selected}>
            {panel}
          </BottomSheet>
        )}
      </div>
    </div>
  )
}
