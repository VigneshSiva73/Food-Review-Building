import type { BuildingLayout, FloorLayout, Vec3 } from '@/types'

/**
 * Floor-separation ("explode") view (plan §27): shifts floor i upward by
 * i × offset, opening uniform gaps for inspection. Pure and non-destructive —
 * the solver layout is never mutated, and selection refs (floorIndex-based)
 * survive unchanged. offset = 0 returns the original objects for memo
 * stability.
 */

const shiftY = (p: Vec3, dy: number): Vec3 => ({ x: p.x, y: p.y + dy, z: p.z })

export interface ExplodedLayout {
  floors: FloorLayout[]
  totalHeight: number
}

export function applyExplode(layout: BuildingLayout, offset: number): ExplodedLayout {
  if (offset === 0) {
    return { floors: layout.floors, totalHeight: layout.totalHeight }
  }

  const floors = layout.floors.map((f) => {
    const dy = f.floorIndex * offset
    return {
      ...f,
      baseY: f.baseY + dy,
      deckY: f.deckY + dy,
      pillars: f.pillars.map((p) => ({ ...p, base: shiftY(p.base, dy) })) as FloorLayout['pillars'],
      slab: {
        ...f.slab,
        corners: f.slab.corners.map((c) => shiftY(c, dy)) as [Vec3, Vec3, Vec3],
      },
    }
  })

  return {
    floors,
    totalHeight: layout.totalHeight + Math.max(0, layout.floors.length - 1) * offset,
  }
}
