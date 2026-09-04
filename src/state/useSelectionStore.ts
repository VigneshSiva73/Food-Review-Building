import { create } from 'zustand'
import type { SelectionRef } from '@/types/selection'
import { sameRef } from '@/types/selection'

interface SelectionState {
  hovered: SelectionRef | null
  selected: SelectionRef | null
  setHovered: (ref: SelectionRef | null) => void
  select: (ref: SelectionRef | null) => void
  clear: () => void
}

/**
 * Hover/selection state shared between the 3D scene and the UI panels
 * (plan §27). Selection never mutates geometry — highlighting is an overlay.
 */
export const useSelectionStore = create<SelectionState>((set, get) => ({
  hovered: null,
  selected: null,

  setHovered(ref) {
    if (!sameRef(get().hovered, ref)) set({ hovered: ref })
  },
  select(ref) {
    set({ selected: ref })
  },
  clear() {
    set({ hovered: null, selected: null })
  },
}))
