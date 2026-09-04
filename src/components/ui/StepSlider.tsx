import { useId } from 'react'

/** Half the CSS thumb width — the range's travel is inset by this at each end. */
const THUMB_RADIUS_PX = 8

export interface StepTick {
  value: number
  /** Dimmed notch, e.g. a month with no reviews. */
  muted?: boolean
  title?: string
}

interface StepSliderProps {
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  label: string
  valueText: string
  ticks?: StepTick[]
  orientation?: 'horizontal' | 'vertical'
  /** Track length in px. Required for vertical, which is rotated. */
  lengthPx?: number
  className?: string
}

/**
 * Discrete step slider.
 *
 * The native range input is styled rather than replaced: it keeps keyboard
 * control, touch behaviour, ARIA and — critically — correct thumb positioning,
 * which a div-based slider would have to reimplement. Notches are painted
 * behind it using the same inset maths the browser uses for thumb travel, so
 * every mark lands exactly under the thumb at its stop.
 */
export function StepSlider({
  min,
  max,
  value,
  onChange,
  label,
  valueText,
  ticks = [],
  orientation = 'horizontal',
  lengthPx,
  className = '',
}: StepSliderProps) {
  const id = useId()
  const span = Math.max(1, max - min)
  const fraction = (value - min) / span
  const vertical = orientation === 'vertical'

  /** Position along the track, matching the browser's thumb inset. */
  const offset = (v: number) =>
    `calc(${THUMB_RADIUS_PX}px + (100% - ${THUMB_RADIUS_PX * 2}px) * ${(v - min) / span})`

  // Painted fill: accent up to the thumb, rail beyond it.
  const fillPercent = `${fraction * 100}%`
  const trackBackground =
    `linear-gradient(to right, var(--color-accent-500) 0%, var(--color-accent-400) ${fillPercent},` +
    ` var(--color-surface-700) ${fillPercent}, var(--color-surface-700) 100%)`

  const input = (
    <div
      className="relative"
      style={vertical ? { width: lengthPx, height: 20 } : { height: 20 }}
    >
      {/* Notches sit behind the input and never intercept pointer events. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {ticks.map((tick) => (
          <span
            key={tick.value}
            title={tick.title}
            className={`absolute top-1/2 h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              tick.muted ? 'bg-surface-600/70' : 'bg-ink-500/70'
            }`}
            style={{ left: offset(tick.value) }}
          />
        ))}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        aria-valuetext={valueText}
        aria-orientation={orientation}
        onChange={(e) => onChange(Number(e.target.value))}
        className="step-slider absolute inset-0 w-full"
        style={{ ['--slider-fill' as string]: trackBackground }}
      />
    </div>
  )

  if (!vertical) return <div className={className}>{input}</div>

  // Rotate for vertical: values run bottom → top, like a slicer's layer slider.
  return (
    <div
      className={`relative ${className}`}
      style={{ width: 20, height: lengthPx }}
    >
      <div
        className="absolute top-1/2 left-1/2"
        style={{ transform: 'translate(-50%, -50%) rotate(-90deg)' }}
      >
        {input}
      </div>
    </div>
  )
}
