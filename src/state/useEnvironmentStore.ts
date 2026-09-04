import { create } from 'zustand'
import { DEFAULT_HOUR, TIME_PRESETS, type CityDensity, type TimePreset } from '@/config'
import { getQualityTier } from '@/utils/quality'

/**
 * Environment settings (plan §39). Kept entirely separate from the food-review
 * stores: nothing here can affect the building, the dataset, or the selection,
 * which is the separation the plan requires.
 *
 * The hour lives here rather than beside the city because it is not a city
 * setting — it lights the sky, the tower and the streets alike, and it stays
 * meaningful with the city switched off.
 *
 * Note what this holds and what it does not: the TARGET hour, the one a control
 * asked for. The hour actually on screen is mid-sweep for a second or two after
 * each change and lives in the driver's ref, because a value that changes every
 * frame has no business in React state.
 */

interface EnvironmentState {
  /** Master switch for the whole city. Off renders the building alone. */
  enabled: boolean
  /** The island the city stands on. Off restores the original flat ground. */
  island: boolean
  /**
   * Every building EXCEPT the Food Building: the city's blocks and the island's
   * settlements. Off leaves the streets and the tower standing alone, which is
   * the state to lay out a new city from.
   */
  buildings: boolean
  /** Animated systems; default off on mobile-class devices. */
  traffic: boolean
  pedestrians: boolean
  density: CityDensity
  /** Target hour on the 24-hour axis; the driver eases the scene toward it. */
  hour: number
  /**
   * Whether the last change of hour should be taken in one step.
   *
   * The sweep runs along the hour axis, because everything the scene shows is
   * a function of that one number — so going from morning to night necessarily
   * passes through the afternoon on the way, and looks like it. That is right
   * for the time control, where the hour IS the subject. It is wrong for a
   * click on a dinner column, which is a request to see that meal's light and
   * not a request to watch the day go by, and where the two hours in between
   * are simply a delay before the answer.
   */
  hourJump: boolean
  /** When on, the hour advances by itself and the scene cycles through a day. */
  autoCycle: boolean
  toggleEnabled: () => void
  toggleIsland: () => void
  toggleBuildings: () => void
  toggleTraffic: () => void
  togglePedestrians: () => void
  setDensity: (d: CityDensity) => void
  setHour: (hour: number) => void
  /** Set the hour and arrive at it immediately — see `hourJump`. */
  jumpToHour: (hour: number) => void
  setPreset: (preset: TimePreset) => void
  toggleAutoCycle: () => void
  /** The auto-cycle writing its own progress back; never a user action. */
  advanceHour: (hour: number) => void
}

/**
 * Opening hour from `?hour=`, if the URL asks for one.
 *
 * Accepts either a number on the 24-hour axis or one of the preset names, so
 * `?hour=21.5` and `?hour=night` both work. Out-of-range and unparseable values
 * are ignored rather than clamped — a typo should open the app normally, not at
 * some hour nobody chose.
 *
 * This exists because the hour is otherwise only reachable by clicking, and a
 * click starts a multi-second sweep. Anything that wants a settled scene at a
 * given hour — a screenshot, a bug report, a link to "the tower at dusk" —
 * needs to ask for it before the first frame, where the driver applies it
 * instantly instead of animating.
 */
export function requestedHour(search: string): number | null {
  const raw = new URLSearchParams(search).get('hour')?.trim()
  // An empty `?hour=` is not midnight. `Number('')` is 0, which is a perfectly
  // valid hour, so without this a truncated link opens the app in the dark.
  if (!raw) return null
  if (raw in TIME_PRESETS) return TIME_PRESETS[raw as TimePreset]
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 24 ? value : null
}

/** Tier defaults, guarded so the store is safe to import under jsdom/SSR. */
function defaults() {
  if (typeof window === 'undefined') {
    return { density: 'high' as CityDensity, animate: true }
  }
  const tier = getQualityTier()
  return { density: tier.cityDensity, animate: tier.cityAnimation }
}

const initial = defaults()
const openingHour =
  typeof window === 'undefined' ? DEFAULT_HOUR : (requestedHour(window.location.search) ?? DEFAULT_HOUR)

export const useEnvironmentStore = create<EnvironmentState>((set) => ({
  enabled: true,
  island: true,
  // Off: the user asked for a bare grid to place buildings on.
  buildings: true,
  traffic: initial.animate,
  pedestrians: initial.animate,
  density: initial.density,
  hour: openingHour,
  autoCycle: false,
  hourJump: false,

  toggleEnabled: () => set((s) => ({ enabled: !s.enabled })),
  toggleIsland: () => set((s) => ({ island: !s.island })),
  toggleBuildings: () => set((s) => ({ buildings: !s.buildings })),
  toggleTraffic: () => set((s) => ({ traffic: !s.traffic })),
  togglePedestrians: () => set((s) => ({ pedestrians: !s.pedestrians })),
  setDensity: (density) => set({ density }),
  // Touching the hour by hand stops the cycle. The alternative is auto quietly
  // dragging the scene off whatever the viewer just chose, which reads as the
  // control being broken rather than as a mode being on.
  setHour: (hour) => set({ hour, autoCycle: false, hourJump: false }),
  setPreset: (preset) =>
    set({ hour: TIME_PRESETS[preset], autoCycle: false, hourJump: false }),
  jumpToHour: (hour) => set({ hour, autoCycle: false, hourJump: true }),
  toggleAutoCycle: () => set((s) => ({ autoCycle: !s.autoCycle })),
  // Deliberately does NOT clear `autoCycle` — this is the cycle reporting where
  // it has got to, so that the slider thumb creeps along with it.
  advanceHour: (hour) => set({ hour, hourJump: false }),
}))
