/**
 * The hour of the day, and what the world looks like at it.
 *
 * The scene used to carry one fixed lighting setup, and a comment in
 * `lightingConfig` explaining why: a second scheme meant balancing every
 * surface twice for a switch that told the reader nothing about the food
 * reviews. That reasoning is now overruled deliberately — the environment is
 * asked to move through a day — but the concern it names is real, so the shape
 * here is built to make the balancing tractable:
 *
 *   - ONE axis. Everything is a function of `hour`. There is no second knob
 *     that can disagree with the first.
 *   - The DAY key holds the values the scene shipped with, verbatim. The
 *     default hour is DAY, so opening the app is pixel-for-pixel what it was.
 *   - Every value is interpolated between neighbouring keys, so authoring a
 *     believable dusk is a matter of placing keys close enough together, not
 *     of writing transition code.
 */

import type { MealType } from '@/types'

/**
 * One authored instant. Everything between two of these is a straight lerp.
 *
 * This carries only what the lighting phase renders. Sky colours, star and
 * cloud levels and the city's night glows arrive on this type in the phases
 * that draw them — a key holding values nothing reads is exactly how the old
 * glazing span sat wrong for months.
 */
export interface HourKeyframe {
  /** Position on the 24-hour axis. Keys are ascending; 24 wraps to the first. */
  hour: number
  /**
   * The one shadow-casting light — the sun by day, the moon at night.
   *
   * Deliberately not the same thing as the visible sun. The shadow frustum is
   * fitted around the origin, so a grazing light pushes shadow footprints out
   * past its edge and they vanish; every key therefore keeps this well clear
   * of the horizon and a test pins it. When the visible sun sets, this fades
   * to a cool moon rather than following it down.
   */
  caster: { color: string; intensity: number; azimuthDeg: number; elevationDeg: number }
  hemisphere: { skyColor: string; groundColor: string; intensity: number }
  /** Opposite the caster, no shadow: keeps the shaded side from going flat. */
  fill: { color: string; intensity: number }
  environmentIntensity: number
  /**
   * Backdrop, the haze that dissolves into it, AND the sky's colour at the
   * horizon.
   *
   * One field carrying all three, so they cannot drift apart. Fog differing
   * from the background re-lights the distant ground and leaves a visible arc
   * where the ground disc ends; a horizon differing from the fog puts a hard
   * silhouette where the far city should be dissolving into the sky. Each was
   * its own string once, kept equal by hand and by a test — deriving them is
   * strictly better than checking them.
   */
  background: string
  /** The visible dome. Its horizon is `background`, above. */
  sky: {
    zenith: string
    /**
     * The band hugging the horizon and leaning toward the sun: dawn and dusk
     * light, or after dark the city's own sodium haze thrown back down.
     */
    glowColor: string
    glowStrength: number
  }
  /**
   * The sun you can see, which is NOT the shadow caster.
   *
   * It has its own angles precisely so it can set. The caster has to stay
   * clear of the horizon or shadows break; the disc has to go below it or
   * there is no sunset. Tying them together is what forces the compromise
   * where neither works.
   */
  sunDisc: {
    color: string
    /** Angular radius in degrees. Real is about 0.27; this is a stylised swell. */
    sizeDeg: number
    intensity: number
    azimuthDeg: number
    elevationDeg: number
  }
  /**
   * The moon.
   *
   * Shares the caster's AZIMUTH after dark, but not its elevation — for
   * exactly the reason the sun disc does not share the caster's either.
   *
   * The caster has to stay high or shadow footprints fall outside the fitted
   * frustum. The visible body has to sit in a narrow band: the opening camera
   * looks about eighteen degrees DOWNWARD, so only about the first twenty
   * degrees above the horizon are on screen at all. At the caster's
   * thirty-two the moon was a long way over the top edge — it rendered
   * perfectly and nobody could ever have seen it — and at four its disc was
   * behind the skyline with only the halo showing over the rooftops.
   *
   * Sharing the azimuth is what keeps them one object: the moon hangs in the
   * direction the moonlight comes from, which is the part the eye actually
   * checks.
   */
  moonDisc: {
    color: string
    sizeDeg: number
    intensity: number
    azimuthDeg: number
    elevationDeg: number
  }
  starIntensity: number
  /**
   * Cloud colour and how much of it shows.
   *
   * Clouds are the one thing in the sky lit from OUTSIDE the palette — they
   * take the sun's colour on their flanks long after the ground has lost it,
   * which is why dusk keeps them bright while everything below has gone dim.
   */
  cloud: { tint: string; opacity: number }
  /** A faint band across the sky. Kept subtle: this is a city under light pollution. */
  milkyWay: number
  /**
   * Knobs only the reflection probe reads.
   *
   * The probe is a 256x128 equirect that the glazing and metalwork mirror. It
   * is not looked at directly, so it wants different numbers from the dome —
   * a sun bright enough to give a specular highlight would be a searchlight if
   * the dome drew it that way.
   */
  probe: { sunGlow: number; horizonWarmth: number }
  /**
   * The city's own lights. Zero through the middle of the day and rising
   * through dusk, so lamps come up gradually rather than snapping on.
   */
  city: { windowGlow: number; lampGlow: number }
  /**
   * The tower's own, and far lower than the city's — an order of magnitude, not
   * a shade.
   *
   * The city's windows glow through a MAP, so only about a quarter of its
   * texels emit and the wall between them stays dark. The tower's glazing has
   * no such map — it has no UVs to hang one on — so whatever goes here lights
   * the entire curtain wall at once. At the city's levels that made the hero a
   * solid gold slab. Giving it per-pane windows means giving the glazing UVs,
   * which is a change to the geometry rather than to a number here.
   */
  hero: { plateGlow: number; glassGlow: number }
}

/** The three the control offers, as hours. */
export const TIME_PRESETS = Object.freeze({
  day: 10,
  afternoon: 15,
  night: 21.5,
})

export type TimePreset = keyof typeof TIME_PRESETS

/**
 * The hour each meal is eaten at.
 *
 * Clicking a column takes the scene to it, which is the one thing the building
 * can say that a chart cannot: a breakfast rating is a morning reading, and
 * looking at it in the dark is looking at it out of its own light. Breakfast
 * is the day key, lunch the afternoon, dinner the night — the same three the
 * time control offers, so a click never lands the scene on an hour no button
 * could reach.
 */
export const MEAL_HOURS: Readonly<Record<MealType, number>> = Object.freeze({
  Breakfast: TIME_PRESETS.day,
  Lunch: TIME_PRESETS.afternoon,
  Dinner: TIME_PRESETS.night,
})

/** Opening state (spec: the app starts bright and natural). */
export const DEFAULT_HOUR = TIME_PRESETS.day

/**
 * Azimuths are authored unwrapped, and every adjacent pair differs by less
 * than 180°, so they interpolate as ordinary numbers with no modular
 * arithmetic anywhere. The one big swing — the caster crossing from the
 * night's moon back to the dawn sun — is placed where intensity is lowest, so
 * the sweep happens in the dark. A test pins the invariant.
 */
const KEYS: readonly HourKeyframe[] = Object.freeze([
  {
    // Deep night. The caster is the moon: cool, dim, and still high enough to
    // throw a usable shadow. The visible sun is far below the horizon.
    hour: 0,
    caster: { color: '#93a8c6', intensity: 0.5, azimuthDeg: 165, elevationDeg: 32 },
    hemisphere: { skyColor: '#2b3d5c', groundColor: '#1b1d24', intensity: 0.3 },
    fill: { color: '#6d84ab', intensity: 0.3 },
    environmentIntensity: 0.12,
    background: '#141c2e',
    sky: { zenith: '#05070f', glowColor: '#6d5544', glowStrength: 1.25 },
    sunDisc: { color: '#e8eef7', sizeDeg: 0.9, intensity: 0, azimuthDeg: -50, elevationDeg: -25 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.9, intensity: 1.0, azimuthDeg: 165, elevationDeg: 14 },
    starIntensity: 1.0,
    cloud: { tint: '#252c3d', opacity: 0.3 },
    milkyWay: 1.0,
    probe: { sunGlow: 0.0, horizonWarmth: 0.0 },
    city: { windowGlow: 0.55, lampGlow: 1.0 },
    hero: { plateGlow: 0.014, glassGlow: 0.42 },
  },
  {
    // Held identical to midnight, so the moon sits still until dawn instead of
    // creeping across a sky nobody is watching.
    hour: 4.5,
    caster: { color: '#93a8c6', intensity: 0.5, azimuthDeg: 165, elevationDeg: 32 },
    hemisphere: { skyColor: '#2b3d5c', groundColor: '#1b1d24', intensity: 0.3 },
    fill: { color: '#6d84ab', intensity: 0.3 },
    environmentIntensity: 0.12,
    background: '#141c2e',
    sky: { zenith: '#05070f', glowColor: '#6d5544', glowStrength: 1.25 },
    sunDisc: { color: '#e8eef7', sizeDeg: 0.9, intensity: 0, azimuthDeg: -50, elevationDeg: -25 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.9, intensity: 1.0, azimuthDeg: 165, elevationDeg: 14 },
    starIntensity: 1.0,
    cloud: { tint: '#252c3d', opacity: 0.3 },
    milkyWay: 1.0,
    probe: { sunGlow: 0.0, horizonWarmth: 0.0 },
    city: { windowGlow: 0.55, lampGlow: 1.0 },
    hero: { plateGlow: 0.014, glassGlow: 0.42 },
  },
  {
    // Dawn. The caster swings 175 degrees from moon to sun across this one hour,
    // which is the largest gap in the table and is why it lives at the dimmest
    // moment of the cycle. The sun itself is still under the horizon.
    hour: 5.5,
    caster: { color: '#c8a68f', intensity: 0.45, azimuthDeg: 120, elevationDeg: 14 },
    hemisphere: { skyColor: '#4a4f5e', groundColor: '#33302e', intensity: 0.3 },
    fill: { color: '#8f93a4', intensity: 0.3 },
    environmentIntensity: 0.08,
    background: '#5a5a72',
    sky: { zenith: '#141d33', glowColor: '#ff9a5c', glowStrength: 0.8 },
    sunDisc: { color: '#ffb488', sizeDeg: 1.2, intensity: 0, azimuthDeg: 118, elevationDeg: -3 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: 120, elevationDeg: 14 },
    starIntensity: 0.45,
    cloud: { tint: '#4a4657', opacity: 0.42 },
    milkyWay: 0.3,
    probe: { sunGlow: 0.3, horizonWarmth: 0.35 },
    city: { windowGlow: 0.42, lampGlow: 0.9 },
    hero: { plateGlow: 0.01, glassGlow: 0.3 },
  },
  {
    // Sunrise.
    hour: 7,
    caster: { color: '#ffcf9a', intensity: 2.0, azimuthDeg: 110, elevationDeg: 14 },
    hemisphere: { skyColor: '#a9b3c4', groundColor: '#7d7466', intensity: 0.4 },
    fill: { color: '#d6dbe6', intensity: 0.44 },
    environmentIntensity: 0.35,
    background: '#a8907e',
    sky: { zenith: '#3f6ea8', glowColor: '#ffb070', glowStrength: 1.4 },
    sunDisc: { color: '#fff0d0', sizeDeg: 1.15, intensity: 1, azimuthDeg: 105, elevationDeg: 6 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: 120, elevationDeg: 14 },
    starIntensity: 0.0,
    cloud: { tint: '#e8c3a4', opacity: 0.52 },
    milkyWay: 0.0,
    probe: { sunGlow: 2.0, horizonWarmth: 0.5 },
    city: { windowGlow: 0.14, lampGlow: 0.35 },
    hero: { plateGlow: 0.0, glassGlow: 0.012 },
  },
  {
    // DAY. The light is the scene's original daylight rig, to the digit. Only
    // the backdrop changed, and only because there is now a sky to see: a
    // near-black void was the right answer when nothing was drawn up there.
    hour: 10,
    caster: { color: '#fff4e0', intensity: 2.4, azimuthDeg: 35, elevationDeg: 35 },
    hemisphere: { skyColor: '#b9c8d6', groundColor: '#8f8577', intensity: 0.45 },
    fill: { color: '#dfe6ee', intensity: 0.5 },
    environmentIntensity: 0.6,
    background: '#aebccb',
    sky: { zenith: '#4a7fc1', glowColor: '#cfd8e6', glowStrength: 0.15 },
    sunDisc: { color: '#fffdf5', sizeDeg: 0.9, intensity: 1, azimuthDeg: 55, elevationDeg: 42 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: 120, elevationDeg: 14 },
    starIntensity: 0.0,
    cloud: { tint: '#ffffff', opacity: 0.55 },
    milkyWay: 0.0,
    probe: { sunGlow: 3.0, horizonWarmth: 0.0 },
    city: { windowGlow: 0.0, lampGlow: 0.0 },
    hero: { plateGlow: 0.0, glassGlow: 0.0 },
  },
  {
    // AFTERNOON. The sun has come down and warmed. Lower elevation is what
    // lengthens the shadows; the colour is what makes it read as afternoon
    // rather than as a dimmer noon.
    hour: 15,
    caster: { color: '#ffe0b4', intensity: 2.3, azimuthDeg: 8, elevationDeg: 22 },
    hemisphere: { skyColor: '#bcc6d0', groundColor: '#95836b', intensity: 0.42 },
    fill: { color: '#e2e0dc', intensity: 0.46 },
    environmentIntensity: 0.56,
    background: '#b8b4ac',
    sky: { zenith: '#4d79ad', glowColor: '#e8cfa8', glowStrength: 0.25 },
    sunDisc: { color: '#fff4dd', sizeDeg: 0.95, intensity: 1, azimuthDeg: 10, elevationDeg: 24 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: 120, elevationDeg: 14 },
    starIntensity: 0.0,
    cloud: { tint: '#f6f0e6', opacity: 0.55 },
    milkyWay: 0.0,
    probe: { sunGlow: 2.6, horizonWarmth: 0.0 },
    city: { windowGlow: 0.0, lampGlow: 0.0 },
    hero: { plateGlow: 0.0, glassGlow: 0.0 },
  },
  {
    // Golden hour.
    hour: 18,
    caster: { color: '#ffd0a0', intensity: 1.9, azimuthDeg: -14, elevationDeg: 16 },
    hemisphere: { skyColor: '#b2a99f', groundColor: '#8a7458', intensity: 0.38 },
    fill: { color: '#dcd2c6', intensity: 0.4 },
    environmentIntensity: 0.5,
    background: '#9a8676',
    sky: { zenith: '#3f6ea8', glowColor: '#ff9e52', glowStrength: 1.2 },
    sunDisc: { color: '#ffd39a', sizeDeg: 1.1, intensity: 1, azimuthDeg: -18, elevationDeg: 8 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: 120, elevationDeg: 14 },
    starIntensity: 0.0,
    cloud: { tint: '#f2cba0', opacity: 0.58 },
    milkyWay: 0.0,
    probe: { sunGlow: 2.0, horizonWarmth: 0.5 },
    city: { windowGlow: 0.12, lampGlow: 0.25 },
    hero: { plateGlow: 0.0, glassGlow: 0.05 },
  },
  {
    // Sunset. The disc is on the horizon and swollen; the caster keeps its
    // distance from it and stays high enough to still cast.
    hour: 19,
    caster: { color: '#ff9d5c', intensity: 1.2, azimuthDeg: -26, elevationDeg: 13 },
    hemisphere: { skyColor: '#8e7d80', groundColor: '#6d5647', intensity: 0.32 },
    fill: { color: '#c2a9a2', intensity: 0.34 },
    environmentIntensity: 0.28,
    background: '#7d6258',
    sky: { zenith: '#2d4d7d', glowColor: '#ff7a3c', glowStrength: 2.2 },
    sunDisc: { color: '#ff9a4d', sizeDeg: 1.3, intensity: 1, azimuthDeg: -28, elevationDeg: 1 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: -26, elevationDeg: 13 },
    starIntensity: 0.05,
    cloud: { tint: '#e79a72', opacity: 0.6 },
    milkyWay: 0.0,
    probe: { sunGlow: 1.4, horizonWarmth: 0.8 },
    city: { windowGlow: 0.22, lampGlow: 0.6 },
    hero: { plateGlow: 0.005, glassGlow: 0.16 },
  },
  {
    // Blue hour. The sun has set — its disc is off — and what is left is the
    // glow it threw at the horizon on the way down.
    hour: 20,
    caster: { color: '#a8b4cc', intensity: 0.5, azimuthDeg: -40, elevationDeg: 20 },
    hemisphere: { skyColor: '#556180', groundColor: '#2f3038', intensity: 0.3 },
    fill: { color: '#7f8ca8', intensity: 0.24 },
    environmentIntensity: 0.12,
    background: '#4a5470',
    sky: { zenith: '#16233f', glowColor: '#7d6a80', glowStrength: 1.1 },
    sunDisc: { color: '#ff8a5c', sizeDeg: 1.2, intensity: 0, azimuthDeg: -38, elevationDeg: -6 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.6, intensity: 0.0, azimuthDeg: -40, elevationDeg: 20 },
    starIntensity: 0.4,
    cloud: { tint: '#6b6a86', opacity: 0.48 },
    milkyWay: 0.35,
    probe: { sunGlow: 0.4, horizonWarmth: 0.3 },
    city: { windowGlow: 0.45, lampGlow: 0.95 },
    hero: { plateGlow: 0.01, glassGlow: 0.3 },
  },
  {
    // NIGHT.
    hour: 21.5,
    caster: { color: '#93a8c6', intensity: 0.5, azimuthDeg: 120, elevationDeg: 32 },
    hemisphere: { skyColor: '#2b3d5c', groundColor: '#1b1d24', intensity: 0.3 },
    fill: { color: '#6d84ab', intensity: 0.3 },
    environmentIntensity: 0.12,
    background: '#141c2e',
    sky: { zenith: '#05070f', glowColor: '#6d5544', glowStrength: 1.25 },
    sunDisc: { color: '#e8eef7', sizeDeg: 0.9, intensity: 0, azimuthDeg: -50, elevationDeg: -18 },
    moonDisc: { color: '#e8eef7', sizeDeg: 1.9, intensity: 1.0, azimuthDeg: 120, elevationDeg: 13 },
    starIntensity: 1.0,
    cloud: { tint: '#252c3d', opacity: 0.3 },
    milkyWay: 1.0,
    probe: { sunGlow: 0.0, horizonWarmth: 0.0 },
    city: { windowGlow: 0.55, lampGlow: 1.0 },
    hero: { plateGlow: 0.014, glassGlow: 0.42 },
  },
])

/**
 * The colour painted behind the canvas before WebGL has drawn anything.
 *
 * Taken from the default hour so the flash before first paint matches the
 * scene that follows it. The live background belongs to the driver, which
 * mutates one Color object it owns; this is only the cold-start value.
 */
export const INITIAL_BACKGROUND = KEYS.find((k) => k.hour === DEFAULT_HOUR)!.background

export const timeOfDayConfig = Object.freeze({
  keys: KEYS,
  /**
   * How long a change of hour takes to play out.
   *
   * Scaled by distance, so stepping Day → Afternoon is brisk while Night → Day
   * — which travels the long way round through dawn — is given room. Clamped
   * at both ends: below the floor a change reads as a jump, above the ceiling
   * the viewer is waiting on an animation rather than watching one.
   */
  transition: Object.freeze({
    baseS: 1.2,
    perHourS: 0.18,
    maxS: 4,
    /** Dragging the hour slider retargets constantly; it gets its own, short, figure. */
    scrubS: 0.35,
  }),
  /**
   * What moves the clouds.
   *
   * Slow enough that the sky reads as drifting rather than as scrolling: at
   * this rate a cloud takes several minutes to cross the frame, which is about
   * what one does.
   */
  wind: Object.freeze({ unitsPerSecond: 6 }),
  /**
   * Unattended cycling. 0.1 h/s puts a full day at four minutes — slow enough
   * that dusk is something you watch rather than something that happens while
   * you blink.
   */
  autoCycle: Object.freeze({ hoursPerSecond: 0.1 }),
})

export type TimeOfDayConfig = typeof timeOfDayConfig
