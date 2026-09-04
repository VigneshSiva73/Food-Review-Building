import { buildingConfig, moduleHeight, type BuildingConfig } from '@/config'
import type { DailyReview, FloorLayout, PillarLayout, Vec3 } from '@/types'
import { planeNormal } from '@/utils/plane'
import { heightForRating } from './heights'
import { CORNER_MEALS, footprintCorners } from './triangle'

/**
 * Solve one day into a floor module (plan §13, leveled stacking §16):
 *
 *   baseY ──┬─ flat deck ring (deckThickness)
 *           ├─ three pillars, heights from ratings
 *           ├─ tilted slab plate resting on the pillar tops
 *           ├─ variable facade band absorbing the height differences
 *   deckY ──┴─ next module's flat datum (baseY + MODULE_HEIGHT)
 *
 * A missing meal (Saturday Dinner, or a data gap) becomes a slender non-data
 * support whose top is the mean of the present pillar tops — it carries the
 * slab corner without inventing a rating (plan §17, §20).
 */
export function solveFloor(
  day: DailyReview,
  floorIndex: number,
  baseY: number,
  c: BuildingConfig = buildingConfig,
): FloorLayout {
  const corners = footprintCorners(c)
  // Columns start at the module base, which is the flat top of the plate
  // below, so consecutive days meet with no void. The deck ring beam that
  // used to occupy this offset is no longer drawn.
  const pillarBaseY = baseY

  // Data pillar heights first, so supports can average them.
  const dataHeights: number[] = []
  for (const meal of CORNER_MEALS) {
    const review = day.meals[meal]
    if (review) dataHeights.push(heightForRating(review.rating, c))
  }
  const supportHeight =
    dataHeights.length > 0
      ? dataHeights.reduce((s, h) => s + h, 0) / dataHeights.length
      : (c.pillarHeightMin + c.pillarHeightMax) / 2

  const pillars = CORNER_MEALS.map((meal, corner) => {
    const review = day.meals[meal]
    const isData = review !== undefined
    const height = review ? heightForRating(review.rating, c) : supportHeight
    const base: Vec3 = { x: corners[corner].x, y: pillarBaseY, z: corners[corner].z }
    const pillar: PillarLayout = {
      mealType: meal,
      corner: corner as 0 | 1 | 2,
      base,
      height,
      isData,
      meta: {
        date: day.date,
        mealType: meal,
        rating: review?.rating,
        vendor: review?.vendor,
        floorIndex,
        isData,
      },
    }
    return pillar
  }) as [PillarLayout, PillarLayout, PillarLayout]

  const slabCorners = pillars.map((p) => ({
    x: p.base.x,
    y: p.base.y + p.height,
    z: p.base.z,
  })) as [Vec3, Vec3, Vec3]

  return {
    date: day.date,
    floorIndex,
    baseY,
    deckY: baseY + moduleHeight(c),
    pillars,
    slab: {
      corners: slabCorners,
      normal: planeNormal(slabCorners[0], slabCorners[1], slabCorners[2]),
      thickness: c.slabThickness,
    },
    availableMeals: CORNER_MEALS.filter((m) => day.meals[m] !== undefined),
  }
}
