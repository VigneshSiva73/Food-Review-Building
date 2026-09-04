import { dataConfig, type ConflictStrategy } from '@/config'
import type { DataIssue, FoodReview } from '@/types'
import { isoToDisplay } from '@/utils/date'

export interface DedupeResult {
  reviews: FoodReview[]
  issues: DataIssue[]
}

/**
 * Collapse records sharing a (date, mealType) key.
 * Identical payloads → 'duplicate' issue, silently safe to drop.
 * Differing payloads → 'conflict' issue, resolved by the configured strategy.
 */
export function dedupeRecords(
  reviews: FoodReview[],
  strategy: ConflictStrategy = dataConfig.conflictStrategy,
): DedupeResult {
  const byKey = new Map<string, FoodReview[]>()
  for (const r of reviews) {
    const key = `${r.date}|${r.mealType}`
    const bucket = byKey.get(key)
    if (bucket) bucket.push(r)
    else byKey.set(key, [r])
  }

  const out: FoodReview[] = []
  const issues: DataIssue[] = []

  for (const bucket of byKey.values()) {
    if (bucket.length === 1) {
      out.push(bucket[0])
      continue
    }

    const [first] = bucket
    const label = `${isoToDisplay(first.date)} ${first.mealType}`
    const allIdentical = bucket.every(
      (r) => r.rating === first.rating && r.vendor === first.vendor,
    )

    if (allIdentical) {
      issues.push({
        type: 'duplicate',
        message: `${bucket.length - 1} exact duplicate record(s) removed for ${label}`,
      })
      out.push(first)
      continue
    }

    issues.push({
      type: 'conflict',
      message: `${bucket.length} conflicting records for ${label} (ratings: ${bucket
        .map((r) => r.rating)
        .join(', ')}); kept "${strategy}"`,
    })
    switch (strategy) {
      case 'first':
        out.push(first)
        break
      case 'last':
        out.push(bucket[bucket.length - 1])
        break
      case 'average': {
        const avg = bucket.reduce((s, r) => s + r.rating, 0) / bucket.length
        out.push({ ...first, rating: Math.round(avg * 1000) / 1000 })
        break
      }
    }
  }

  return { reviews: out, issues }
}
