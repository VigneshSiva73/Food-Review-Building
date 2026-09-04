import type { ComponentType, SVGProps } from 'react'
import {
  ExplodeIcon,
  EyeIcon,
  EyeOffIcon,
  FacadeIcon,
  FullscreenIcon,
  HomeIcon,
  IslandIcon,
  OrbitIcon,
  ReplayIcon,
  SkipIcon,
} from '@/components/ui/icons'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { useAnimationStore } from '@/state/useAnimationStore'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { useRuntimeStore } from '@/state/useRuntimeStore'
import { useViewStore } from '@/state/useViewStore'

function ControlButton({
  label,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-accent-500/20 text-accent-400'
          : 'text-ink-300 hover:bg-surface-700 hover:text-ink-100'
      }`}
    >
      <Icon />
    </button>
  )
}

/**
 * Floating viewport toolbar. Vertical on the left edge so it mirrors the day
 * slider on the right and leaves the whole bottom edge to the month slider —
 * the two used to overlap, clipping the last button.
 */
export function ViewportControls() {
  const autoRotate = useViewStore((s) => s.autoRotate)
  const showDetails = useViewStore((s) => s.showDetails)
  const explode = useViewStore((s) => s.explode)
  const toggleAutoRotate = useViewStore((s) => s.toggleAutoRotate)
  const toggleDetails = useViewStore((s) => s.toggleDetails)
  const toggleExplode = useViewStore((s) => s.toggleExplode)
  const requestCameraReset = useViewStore((s) => s.requestCameraReset)
  const requestIslandView = useViewStore((s) => s.requestIslandView)
  const islandEnabled = useEnvironmentStore((s) => s.island)
  const constructing = useAnimationStore((s) => s.phase) === 'running'
  const skip = useAnimationStore((s) => s.skip)
  const replay = useAnimationStore((s) => s.replay)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const fullMode = useRuntimeStore((s) => s.fullMode)
  const toggleFullMode = useRuntimeStore((s) => s.toggleFullMode)
  const mode = useResponsiveLayout()
  const compact = mode === 'mobile'

  return (
    <div
      className={`pointer-events-auto absolute z-10 flex gap-1 rounded-2xl border border-surface-600/80 bg-surface-900/90 p-1 backdrop-blur-md ${
        compact ? 'top-3 right-3 flex-col' : 'top-1/2 left-4 -translate-y-1/2 flex-col'
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.05), 0 18px 40px rgb(0 0 0 / 0.45)' }}
      role="toolbar"
      aria-label="Viewport controls"
    >
      <ControlButton
        label={constructing ? 'Skip construction animation' : 'Replay construction animation'}
        icon={constructing ? SkipIcon : ReplayIcon}
        onClick={constructing ? skip : replay}
      />
      <ControlButton label="Reset camera (R)" icon={HomeIcon} onClick={requestCameraReset} />
      {/* Only offered when there is an island to look at. Reset brings you
          back, so this needs no paired button of its own. */}
      {islandEnabled && (
        <ControlButton label="View the island" icon={IslandIcon} onClick={requestIslandView} />
      )}
      <ControlButton
        label="Auto-rotate"
        icon={OrbitIcon}
        active={autoRotate}
        onClick={toggleAutoRotate}
      />
      <div className="my-0.5 h-px bg-surface-700" aria-hidden />
      <ControlButton
        label="Toggle facade details"
        icon={FacadeIcon}
        active={showDetails}
        onClick={toggleDetails}
      />
      <ControlButton
        label="Separate floors"
        icon={ExplodeIcon}
        active={explode}
        onClick={toggleExplode}
      />
      <ControlButton
        label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        icon={FullscreenIcon}
        active={isFullscreen}
        onClick={toggleFullscreen}
      />
      <ControlButton
        label={fullMode ? 'Exit full 3D view' : 'Full 3D view'}
        icon={fullMode ? EyeOffIcon : EyeIcon}
        active={fullMode}
        onClick={toggleFullMode}
      />
    </div>
  )
}
