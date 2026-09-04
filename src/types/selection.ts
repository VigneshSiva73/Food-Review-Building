/**
 * Stable references to selectable objects (plan §§9, 27). Refs survive
 * layout rebuilds; they resolve to full metadata via
 * `resolveSelection(layout, ref)`.
 */

export type SelectionRef =
  | { kind: 'pillar'; floorIndex: number; corner: 0 | 1 | 2 }
  | { kind: 'floor'; floorIndex: number }
  /**
   * The whole month, as one object. Carries no index because there is only
   * ever one building on screen — the crown is the part of it you point at.
   */
  | { kind: 'building' }
  /**
   * One meal, across the whole month: the column that carries it on every
   * floor, and the rib that carries its line past the last plate.
   */
  | { kind: 'meal'; corner: 0 | 1 | 2 }

/**
 * The refs that name a place in the stack.
 *
 * The other two — the building and a meal — are whole-tower references with no
 * floor behind them, and every consumer that steps, slices or frames by floor
 * has to say what it does with those rather than read an index that is not
 * there. This is the one place that distinction is written down.
 */
export type IndexedRef = Extract<SelectionRef, { floorIndex: number }>

export function indexedRef(ref: SelectionRef | null): IndexedRef | null {
  return ref && 'floorIndex' in ref ? ref : null
}

export function sameRef(a: SelectionRef | null, b: SelectionRef | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'pillar' && b.kind === 'pillar') {
    return a.floorIndex === b.floorIndex && a.corner === b.corner
  }
  if (a.kind === 'floor' && b.kind === 'floor') return a.floorIndex === b.floorIndex
  // Two building refs are the same building: there is only one on screen.
  if (a.kind === 'building' && b.kind === 'building') return true
  if (a.kind === 'meal' && b.kind === 'meal') return a.corner === b.corner
  return false
}
