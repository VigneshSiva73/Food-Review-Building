import { useEffect } from 'react'
import { useRuntimeStore } from '@/state/useRuntimeStore'

/**
 * Eye symbol button on the left side of the screen.
 * Toggles Full 3D View mode, hiding all header/sidebar/panel UI bars.
 */
export function EyeViewToggle() {
  const fullMode = useRuntimeStore((s) => s.fullMode)
  const toggleFullMode = useRuntimeStore((s) => s.toggleFullMode)
  const setFullMode = useRuntimeStore((s) => s.setFullMode)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullMode) {
        setFullMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fullMode, setFullMode])

  return (
    <aside
      className="fixed left-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-surface-700/80 bg-surface-900/80 p-1.5 backdrop-blur-md shadow-2xl"
      aria-label="Left view bar"
    >
      <button
        type="button"
        onClick={toggleFullMode}
        className={`group relative flex h-11 w-11 items-center justify-center rounded-xl border backdrop-blur-md transition-all duration-200 focus:outline-none focus:ring-2 ${
          fullMode
            ? 'border-brand-500 bg-surface-900/90 text-brand-400 shadow-lg shadow-brand-500/20 hover:bg-surface-800'
            : 'border-surface-700/80 bg-surface-900/80 text-ink-200 shadow-md hover:border-brand-500 hover:bg-surface-800 hover:text-white hover:shadow-lg'
        }`}
        title={fullMode ? 'Exit Full Mode (Esc)' : 'Enter Full 3D Mode'}
        aria-label={fullMode ? 'Exit Full Mode' : 'Enter Full 3D Mode'}
      >
        {fullMode ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
            <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
            <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.168-4.52" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}

        <span className="pointer-events-none absolute left-14 whitespace-nowrap rounded-md border border-surface-700 bg-surface-900 px-2.5 py-1 text-xs font-medium text-ink-200 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
          {fullMode ? 'Exit Full Mode (Esc)' : 'Full 3D View'}
        </span>
      </button>
    </aside>
  )
}
