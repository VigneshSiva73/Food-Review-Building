import Papa from 'papaparse'
import { dataConfig } from '@/config'

/** One CSV row with fields still unvalidated. `row` is the 1-based data row. */
export interface RawRow {
  row: number
  date: string
  mealType: string
  rating: string
  vendor: string
  /** Empty when the file carries no attendance columns at all. */
  count: string
  consumed: string
  reviewed: string
}

export interface ParseResult {
  rows: RawRow[]
  /** Fatal structural problems (missing headers, unreadable file). */
  parseErrors: string[]
}

// Strip a UTF-8 BOM (spreadsheet exports add one) before normalizing.
const normalizeHeader = (h: string) =>
  h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Parse CSV text into raw rows, tolerant of header case/spacing. */
export function parseCsv(text: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  })

  const parseErrors = result.errors
    .filter((e) => e.type !== 'FieldMismatch') // per-row issues surface in validation
    .map((e) => `${e.type}: ${e.message}${e.row != null ? ` (row ${e.row + 1})` : ''}`)

  const h = dataConfig.headers
  const fields = result.meta.fields ?? []
  for (const required of [h.date, h.mealType, h.rating, h.vendor]) {
    if (!fields.includes(required)) {
      parseErrors.push(`Missing required column "${required}" (found: ${fields.join(', ') || 'none'})`)
    }
  }
  if (parseErrors.length > 0) return { rows: [], parseErrors }

  const rows: RawRow[] = result.data.map((r, i) => ({
    row: i + 1,
    date: (r[h.date] ?? '').trim(),
    mealType: (r[h.mealType] ?? '').trim(),
    rating: (r[h.rating] ?? '').trim(),
    vendor: (r[h.vendor] ?? '').trim(),
    // Not in the required-header check above, deliberately: attendance is
    // optional, so a file without these columns parses rather than failing.
    count: (r[h.count] ?? '').trim(),
    consumed: (r[h.consumed] ?? '').trim(),
    reviewed: (r[h.reviewed] ?? '').trim(),
  }))

  return { rows, parseErrors: [] }
}
