import { buildingConfig, moduleHeight, type BuildingConfig } from '@/config'
import type { BuildingLayout, DailyReview, FloorLayout } from '@/types'
import { solveFloor } from './floorSolver'
import { footprintRadius } from './triangle'

/**
 * Dataset days → complete building layout (plan §21).
 *
 * Review days stack directly, as constant-height modules, one per floor.
 *
 * Non-review days used to open a recessed dark band in the stack — one per
 * calendar gap, merged when consecutive. Those were removed on request: they
 * broke the tower into segments and the days they stood for are already
 * legible from the floor dates. The calendar walk went with them, because
 * without bands there is nothing to do with a gap but skip it, which is what
 * iterating the data days already does.
 *
 * Leveled stacking keeps the tower plumb at any dataset size; the 'organic'
 * mode from plan §16 is an experiment deferred until after v1 — the solver
 * warns rather than silently changing shape.
 */
export function buildLayout(
  days: DailyReview[],
  c: BuildingConfig = buildingConfig,
): BuildingLayout {
  if (c.stackingMode === 'organic') {
    console.warn('[layout] stackingMode "organic" is not implemented yet; using "leveled".')
  }

  const mh = moduleHeight(c)
  const floors: FloorLayout[] = days.map((day, i) => solveFloor(day, i, i * mh, c))

  return {
    floors,
    totalHeight: floors.length * mh,
    radius: footprintRadius(c),
  }
}
