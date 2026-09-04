import { buildingConfig, slabOverhang, type BuildingConfig } from '@/config'
import type { MealType, Vec3 } from '@/types'

/**
 * The triangular footprint (plan §14).
 * Semantic corner mapping is fixed and never depends on CSV order:
 *   corner 0 = Breakfast → front-left
 *   corner 1 = Lunch     → front-right
 *   corner 2 = Dinner    → rear (pushed back for a subtly scalene plan)
 * "Front" faces +z (toward the initial camera).
 */

export const CORNER_MEALS: readonly [MealType, MealType, MealType] = [
  'Breakfast',
  'Lunch',
  'Dinner',
]

export function footprintCorners(c: BuildingConfig = buildingConfig): [Vec3, Vec3, Vec3] {
  const s = c.triangleSide
  const h = (s * Math.sqrt(3)) / 2 // equilateral triangle height
  const frontZ = h / 3
  const rearZ = -(2 * h) / 3 - c.rearCornerOffset * s

  /**
   * Centre the footprint's *extent* on the origin, which is where the plaza is
   * centred and where the camera orbits.
   *
   * Two things pulled it off centre, and the comment here used to claim the
   * opposite. A triangle's centroid sits a third of the way up its height, not
   * half, so even a perfect equilateral placed centroid-at-origin reaches much
   * further behind the origin than in front of it. `rearCornerOffset` then
   * pushes the rear corner back again without compensating. Together the plan
   * ran from 68 behind the origin to 30 in front — visibly shunted to one side
   * of its square block.
   *
   * Balancing the extent rather than the centroid is what reads as centred
   * when the site is a square: the paving left over is then the same depth
   * front and back. The centroid ends up slightly forward of the plaza centre,
   * which is unavoidable for a triangle and is not what the eye measures.
   */
  const centre = (frontZ + rearZ) / 2

  return [
    { x: -s / 2, y: 0, z: frontZ - centre }, // Breakfast, front-left
    { x: s / 2, y: 0, z: frontZ - centre }, // Lunch, front-right
    { x: 0, y: 0, z: rearZ - centre }, // Dinner, rear
  ]
}

/** Horizontal bounding radius of the footprint incl. pillar overhang. */
export function footprintRadius(c: BuildingConfig = buildingConfig): number {
  const corners = footprintCorners(c)
  const maxCorner = Math.max(...corners.map((p) => Math.hypot(p.x, p.z)))
  return maxCorner + c.pillarWidth
}

/** Radius of the floor plate outline; used to frame a whole floor on camera. */
export function plateRadius(c: BuildingConfig = buildingConfig): number {
  const corners = footprintCorners(c)
  const maxCorner = Math.max(...corners.map((p) => Math.hypot(p.x, p.z)))
  return maxCorner + slabOverhang(c)
}
