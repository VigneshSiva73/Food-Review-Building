/**
 * Date helpers for the DD/MM/YYYY source format and the office calendar rules.
 * All arithmetic is UTC-based to avoid timezone drift.
 */

const DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/

/** Strictly parse `DD/MM/YYYY` into ISO `yyyy-mm-dd`; null when invalid. */
export function parseDDMMYYYY(value: string): string | null {
  const m = DDMMYYYY.exec(value.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject dates that roll over (e.g. 31/02) — Date silently normalizes them.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${yyyy}-${mm}-${dd}`
}

/** Format ISO `yyyy-mm-dd` back to display `DD/MM/YYYY`. */
export function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOfISO(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

export function isThirdSaturdayISO(iso: string): boolean {
  if (weekdayOfISO(iso) !== 6) return false
  const dayOfMonth = Number(iso.slice(8, 10))
  return Math.ceil(dayOfMonth / 7) === 3
}

/** Leave days: every Sunday and the third Saturday of each month. */
export function isLeaveDayISO(iso: string): boolean {
  return weekdayOfISO(iso) === 0 || isThirdSaturdayISO(iso)
}

/** All ISO dates from `startISO` to `endISO` inclusive. */
export function isoDateRange(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${endISO}T00:00:00Z`)
  for (let t = Date.parse(`${startISO}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}
