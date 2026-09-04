import { create } from 'zustand'
import { prefersReducedMotion } from '@/utils/motion'

export type ConstructionPhase = 'running' | 'done'

interface AnimationState {
  phase: ConstructionPhase
  /** Bumped on each replay so the animator restarts its clock. */
  runNonce: number
  skip: () => void
  replay: () => void
}

/**
 * Construction-intro state (plan §29). Reduced-motion users start at the
 * finished building; everyone else can skip or replay at will.
 */
export const useAnimationStore = create<AnimationState>((set) => ({
  phase: prefersReducedMotion() ? 'done' : 'running',
  runNonce: 0,

  skip: () => set({ phase: 'done' }),
  replay: () => set((s) => ({ phase: 'running', runNonce: s.runNonce + 1 })),
}))
