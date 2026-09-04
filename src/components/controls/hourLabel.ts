/**
 * An hour on the 24-hour axis, as a clock reading.
 *
 * The axis is continuous and fractional — 19.5 is half past seven — so this is
 * not a formatting nicety: it is the only place the number becomes something a
 * person can read. Kept out of the control that uses it so the panel can label
 * a row with it without importing a component.
 */
export function hourLabel(hour: number): string {
  const total = Math.round(hour * 60)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
