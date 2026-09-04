import { buildingConfig, dataConfig, type BuildingConfig } from '@/config'

/**
 * Rating → structural pillar height (plan §12).
 * Linear normalization over the configured rating range, clamped so a
 * malformed rating can never produce degenerate geometry.
 */
export function heightForRating(rating: number, c: BuildingConfig = buildingConfig): number {
  const { ratingMin, ratingMax } = dataConfig
  const n = Math.min(1, Math.max(0, (rating - ratingMin) / (ratingMax - ratingMin)))
  return c.pillarHeightMin + n * (c.pillarHeightMax - c.pillarHeightMin)
}
