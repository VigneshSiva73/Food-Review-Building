import type { ReactNode } from 'react'
import type { CityDensity } from '@/config'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { HourSlider, TimeOfDayControls } from './TimeOfDayControls'
import { hourLabel } from './hourLabel'

/**
 * Controls for the city environment (plan §§39, 10).
 *
 * Everything here writes to `useEnvironmentStore` and nothing else. The
 * food-review stores are untouched, which is the separation the plan requires:
 * no control on this card can change the dataset, the selection, or a single
 * thing about the building.
 *
 * With the city switched off the city rows are disabled rather than hidden, so
 * the card does not resize under the pointer and it stays obvious what turning
 * the city back on would restore. The Time row is the exception, and sits above
 * the master switch to say so: the hour lights the sky and the tower, so it
 * keeps working with the city gone.
 */

function Row({
  label,
  labelId,
  children,
}: {
  label: string
  /** Set when the control is its own labelled group rather than a plain input. */
  labelId?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span id={labelId} className="text-sm text-ink-300">
        {label}
      </span>
      {children}
    </div>
  )
}

function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-accent-500/70' : 'bg-surface-600'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink-100 transition-all ${
          checked ? 'left-4.5' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  disabled?: boolean
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex overflow-hidden rounded-lg border border-surface-600/80"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
              active
                ? 'bg-accent-500/20 text-accent-400'
                : 'text-ink-400 hover:bg-surface-700 hover:text-ink-100'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

const DENSITIES: readonly { value: CityDensity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
]

export function EnvironmentPanel() {
  const enabled = useEnvironmentStore((s) => s.enabled)
  const island = useEnvironmentStore((s) => s.island)
  const buildings = useEnvironmentStore((s) => s.buildings)
  const hour = useEnvironmentStore((s) => s.hour)
  const autoCycle = useEnvironmentStore((s) => s.autoCycle)
  const toggleAutoCycle = useEnvironmentStore((s) => s.toggleAutoCycle)
  const density = useEnvironmentStore((s) => s.density)
  const traffic = useEnvironmentStore((s) => s.traffic)
  const pedestrians = useEnvironmentStore((s) => s.pedestrians)
  const toggleEnabled = useEnvironmentStore((s) => s.toggleEnabled)
  const toggleIsland = useEnvironmentStore((s) => s.toggleIsland)
  const toggleBuildings = useEnvironmentStore((s) => s.toggleBuildings)
  const setDensity = useEnvironmentStore((s) => s.setDensity)
  const toggleTraffic = useEnvironmentStore((s) => s.toggleTraffic)
  const togglePedestrians = useEnvironmentStore((s) => s.togglePedestrians)

  return (
    <div className="space-y-2.5">
      <Row label="Time" labelId="env-time-label">
        <TimeOfDayControls labelledBy="env-time-label" />
      </Row>
      <Row label={hourLabel(hour)}>
        <div className="w-40">
          <HourSlider />
        </div>
      </Row>
      <Row label="Auto cycle">
        <Switch label="Cycle through the day" checked={autoCycle} onChange={toggleAutoCycle} />
      </Row>
      <Row label="Island">
        <Switch label="Show the island" checked={island} onChange={toggleIsland} />
      </Row>
      <Row label="Buildings">
        <Switch
          label="Show buildings other than the Food Building"
          checked={buildings}
          onChange={toggleBuildings}
        />
      </Row>
      <Row label="City">
        <Switch label="Show the city" checked={enabled} onChange={toggleEnabled} />
      </Row>
      <Row label="Density">
        <Segmented
          label="City density"
          value={density}
          options={DENSITIES}
          disabled={!enabled}
          onChange={setDensity}
        />
      </Row>
      <Row label="Traffic">
        <Switch
          label="Animate traffic"
          checked={traffic}
          disabled={!enabled}
          onChange={toggleTraffic}
        />
      </Row>
      <Row label="Pedestrians">
        <Switch
          label="Animate pedestrians"
          checked={pedestrians}
          disabled={!enabled}
          onChange={togglePedestrians}
        />
      </Row>
    </div>
  )
}
