import type { Dataset } from '@/types'
import { parseCsv } from './parse'
import { validateRows } from './validate'
import { dedupeRecords } from './dedupe'
import { applyCalendarRules } from './calendar'
import { groupByDate } from './group'
import { computeStats } from './stats'

export { parseCsv } from './parse'
export { validateRows } from './validate'
export { dedupeRecords } from './dedupe'
export { applyCalendarRules } from './calendar'
export { groupByDate } from './group'
export { computeStats } from './stats'

/**
 * Full pipeline: CSV text → cleaned, grouped, chronological Dataset.
 * Throws only on structurally unreadable input (missing columns);
 * every row-level problem becomes a DataIssue instead.
 */
export function runPipeline(csvText: string): Dataset {
  const parsed = parseCsv(csvText)
  if (parsed.parseErrors.length > 0) {
    throw new Error(`CSV is not readable: ${parsed.parseErrors.join('; ')}`)
  }

  const validated = validateRows(parsed.rows)
  const deduped = dedupeRecords(validated.reviews)
  const calendared = applyCalendarRules(deduped.reviews)
  const days = groupByDate(calendared.reviews)
  const issues = [...validated.issues, ...deduped.issues, ...calendared.issues]

  return { days, issues, stats: computeStats(days, issues) }
}
