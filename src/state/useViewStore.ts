import { create } from 'zustand'
import type { SelectionRef } from '@/types/selection'
import { getQualityTier } from '@/utils/quality'

interface ViewState {
  autoRotate: boolean
  /** Architectural detail layer (mullions); defaults off on mobile tier. */
  showDetails: boolean
  /** Floor-separation view (animated, non-destructive). */
  explode: boolean
  /** Monotonic counter; incrementing requests a camera reset to the fit pose. */
  resetSignal: number
  /** Bumped to fly out to a framing that shows the whole island. */
  islandViewSignal: number
  /** Latest camera-focus request; nonce distinguishes repeats on one target. */
  focusRequest: { ref: SelectionRef; nonce: number } | null
  toggleAutoRotate: () => void
  toggleDetails: () => void
  toggleExplode: () => void
  requestCameraReset: () => void
  requestIslandView: () => void
  requestFocus: (ref: SelectionRef) => void
}

export const useViewStore = create<ViewState>((set) => ({
  autoRotate: false,
  showDetails: typeof window !== 'undefined' ? getQualityTier().mullions : true,
  explode: false,
  resetSignal: 0,
  islandViewSignal: 0,
  focusRequest: null,

  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  toggleDetails: () => set((s) => ({ showDetails: !s.showDetails })),
  toggleExplode: () => set((s) => ({ explode: !s.explode })),
  requestCameraReset: () => set((s) => ({ resetSignal: s.resetSignal + 1 })),
  requestIslandView: () => set((s) => ({ islandViewSignal: s.islandViewSignal + 1 })),
  requestFocus: (ref) =>
    set((s) => ({ focusRequest: { ref, nonce: (s.focusRequest?.nonce ?? 0) + 1 } })),
}))
