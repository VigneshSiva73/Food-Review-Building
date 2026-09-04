import { create } from 'zustand'

interface RuntimeState {
  /** True while the GPU context is lost and the browser tries to restore it. */
  contextLost: boolean
  /** True when the 3D scene threw during mount/render. */
  sceneCrashed: boolean
  /** True when in full 3D view mode (hiding all UI panels, header, and bars). */
  fullMode: boolean
  setContextLost: (lost: boolean) => void
  setSceneCrashed: (crashed: boolean) => void
  setFullMode: (full: boolean) => void
  toggleFullMode: () => void
}

/** Renderer health and view modes, kept apart from data (plan §33). */
export const useRuntimeStore = create<RuntimeState>((set) => ({
  contextLost: false,
  sceneCrashed: false,
  fullMode: false,
  setContextLost: (contextLost) => set({ contextLost }),
  setSceneCrashed: (sceneCrashed) => set({ sceneCrashed }),
  setFullMode: (fullMode) => set({ fullMode }),
  toggleFullMode: () => set((state) => ({ fullMode: !state.fullMode })),
}))
