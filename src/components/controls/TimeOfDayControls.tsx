import { useMemo } from 'react'
import { TIME_PRESETS, type TimePreset } from '@/config'
import { StepSlider, type StepTick } from '@/components/ui/StepSlider'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { hourLabel } from './hourLabel'

/**
 * The hour control.
 *
 * Deliberately NOT disabled when the city is switched off, unlike every other
 * row in the environment panel. The hour lights the sky and the tower, not just
 * the streets — greying it out with the city would hide a control that still
 * does something.
 */

interface Option {
  value: TimePreset
  label: string
}

const OPTIONS: readonly Option[] = [
  { value: 'day', label: 'Day' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'night', label: 'Night' },
]

/**
 * How close the target has to be to a preset for that button to read as on.
 *
 * The hour is a continuous axis, so it can sit between two presets — this is
 * the tolerance that decides whether a button lights up rather than an equality
 * check that would fail on a value one lerp away from its own preset.
 */
const MATCH_TOLERANCE_H = 0.25

export function TimeOfDayControls({
  labelledBy,
}: {
  /** Id of the row label, so the group is announced with its name. */
  labelledBy: string
}) {
  const hour = useEnvironmentStore((s) => s.hour)
  const setPreset = useEnvironmentStore((s) => s.setPreset)

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex overflow-hidden rounded-md border border-surface-600"
    >
      {OPTIONS.map(({ value, label }) => {
        const selected = Math.abs(hour - TIME_PRESETS[value]) < MATCH_TOLERANCE_H
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreset(value)}
            className={`px-2 py-0.5 text-xs transition-colors ${
              selected
                ? 'bg-accent-500/20 font-medium text-accent-400'
                : 'text-ink-500 hover:bg-surface-700 hover:text-ink-300'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** Half-hour steps: 0 = 00:00, 47 = 23:30. */
const STEPS = 48
const STEP_HOURS = 24 / STEPS

/**
 * The continuous hour, as a slider.
 *
 * Forty-eight steps rather than twenty-four. Everything interesting happens
 * between six in the evening and half past nine — sunset, blue hour, the lights
 * coming on — and whole hours step straight over most of it.
 */
export function HourSlider() {
  const hour = useEnvironmentStore((s) => s.hour)
  const setHour = useEnvironmentStore((s) => s.setHour)

  const ticks = useMemo<StepTick[]>(
    () =>
      Array.from({ length: STEPS }, (_, i) => ({
        value: i,
        // Quarter-day marks only; a notch every half hour is a comb.
        muted: i % 12 !== 0,
        title: i % 12 === 0 ? hourLabel(i * STEP_HOURS) : undefined,
      })),
    [],
  )

  return (
    <StepSlider
      min={0}
      max={STEPS - 1}
      value={Math.round(hour / STEP_HOURS) % STEPS}
      ticks={ticks}
      label="Hour of day"
      valueText={hourLabel(hour)}
      onChange={(step) => setHour(step * STEP_HOURS)}
    />
  )
}
