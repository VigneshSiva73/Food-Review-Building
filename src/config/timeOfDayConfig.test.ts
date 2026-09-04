import { describe, expect, it } from 'vitest'
import { cameraConfig } from './cameraConfig'
import {
  DEFAULT_HOUR,
  INITIAL_BACKGROUND,
  MEAL_HOURS,
  TIME_PRESETS,
  timeOfDayConfig,
} from './timeOfDayConfig'

const KEYS = timeOfDayConfig.keys

describe('time-of-day keyframes', () => {
  it('lights the daylight scene exactly as it shipped', () => {
    // This replaces the guard that used to forbid a time-of-day table
    // outright. Its concern was that adding hours would quietly shift values
    // nobody re-checked, and that concern survives the feature: the DAY key
    // still holds the daylight rig the scene was signed off with, to the digit,
    // and DAY is where the app opens.
    //
    // The backdrop is the one deliberate exception, and it is checked below
    // rather than here. A near-black void was the right answer when nothing was
    // drawn up there; now that there is a sky, day gets one.
    const day = KEYS.find((k) => k.hour === TIME_PRESETS.day)!
    expect(day.caster).toEqual({
      color: '#fff4e0',
      intensity: 2.4,
      azimuthDeg: 35,
      elevationDeg: 35,
    })
    expect(day.hemisphere).toEqual({
      skyColor: '#b9c8d6',
      groundColor: '#8f8577',
      intensity: 0.45,
    })
    expect(day.fill).toEqual({ color: '#dfe6ee', intensity: 0.5 })
    expect(day.environmentIntensity).toBe(0.6)
    expect(DEFAULT_HOUR).toBe(TIME_PRESETS.day)
    expect(INITIAL_BACKGROUND).toBe(day.background)
  })

  it('gives the day a sky rather than a void', () => {
    // The backdrop is also the fog and the dome's horizon, so this one value
    // decides whether the far city dissolves into daylight or into a black
    // wall. It shipped near-black because nothing was drawn up there.
    const day = KEYS.find((k) => k.hour === TIME_PRESETS.day)!
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(day.background.slice(i, i + 2), 16))
    expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeGreaterThan(120)
    // Daylight at the horizon is a pale blue-grey: cool, and never warm.
    expect(b).toBeGreaterThan(r)
  })

  it('is one ascending pass over a single day', () => {
    expect(KEYS.length).toBeGreaterThan(2)
    expect(KEYS[0].hour).toBe(0)
    expect(KEYS[KEYS.length - 1].hour).toBeLessThan(24)
    for (let i = 1; i < KEYS.length; i++) {
      expect(`${i}:${KEYS[i].hour > KEYS[i - 1].hour}`).toBe(`${i}:true`)
    }
  })

  it('offers a keyframe at each hour the control names', () => {
    // The presets are hours like everything else, but a preset that landed
    // between two keys would blend two authored looks into a third nobody
    // approved — so each one gets a key of its own.
    for (const hour of Object.values(TIME_PRESETS)) {
      expect(`${hour}:${KEYS.some((k) => k.hour === hour)}`).toBe(`${hour}:true`)
    }
  })

  it('keeps the shadow caster clear of the horizon at every hour', () => {
    // The shadow frustum is fitted around the origin, so a grazing light
    // pushes shadow footprints out past its edge and they vanish. Because
    // every key clears the limit and the curve between two keys is a straight
    // lerp, checking the keys checks all 24 hours.
    //
    // This is also why the caster is not the visible sun: the sun has to set,
    // and this must not.
    for (const k of KEYS) {
      expect(`${k.hour}:${k.caster.elevationDeg >= 12}`).toBe(`${k.hour}:true`)
      expect(`${k.hour}:${k.caster.elevationDeg < 90}`).toBe(`${k.hour}:true`)
      expect(`${k.hour}:${k.caster.intensity >= 0.2}`).toBe(`${k.hour}:true`)
    }
  })

  it('never swings the light the long way round', () => {
    // Azimuths are plain scalars, lerped without modular arithmetic, so an
    // adjacent pair more than 180° apart would send the sun backwards across
    // the whole sky and drag every shadow with it. Authoring inside 180° is
    // what makes the simple lerp correct; this is the guard on the authoring.
    const wrapped = [...KEYS, { ...KEYS[0], hour: 24 }]
    for (let i = 1; i < wrapped.length; i++) {
      const gap = Math.abs(wrapped[i].caster.azimuthDeg - wrapped[i - 1].caster.azimuthDeg)
      expect(`${wrapped[i - 1].hour}->${wrapped[i].hour}:${gap < 180}`).toBe(
        `${wrapped[i - 1].hour}->${wrapped[i].hour}:true`,
      )
    }
  })

  it('gets darker from afternoon into the night', () => {
    // The one property that makes the curve read as a day rather than as ten
    // unrelated looks. Checked on the caster and the ambient together, since a
    // dimming sun with a brightening sky is a lighting bug, not a dusk.
    const evening = [TIME_PRESETS.afternoon, 18, 19, 20, TIME_PRESETS.night].map(
      (h) => KEYS.find((k) => k.hour === h)!,
    )
    for (let i = 1; i < evening.length; i++) {
      const a = evening[i - 1]
      const b = evening[i]
      expect(`${b.hour} caster:${b.caster.intensity <= a.caster.intensity}`).toBe(
        `${b.hour} caster:true`,
      )
      expect(`${b.hour} ambient:${b.hemisphere.intensity <= a.hemisphere.intensity}`).toBe(
        `${b.hour} ambient:true`,
      )
      expect(`${b.hour} env:${b.environmentIntensity <= a.environmentIntensity}`).toBe(
        `${b.hour} env:true`,
      )
    }
  })

  it('makes the sky one arc with its peak at midday', () => {
    // Caught by measuring rather than by eye: night's backdrop was authored at
    // the same luminance as day's, so the sky region of a night render came out
    // 5% BRIGHTER than the same region at noon. Every colour was individually
    // plausible; only the ordering was wrong.
    //
    // Backdrop and fog are the same field, so this pins the haze too — and the
    // sky is most of the frame, which is why getting it backwards undoes the
    // whole effect however carefully the lights are tuned.
    const lum = (hex: string) =>
      0.2126 * parseInt(hex.slice(1, 3), 16) +
      0.7152 * parseInt(hex.slice(3, 5), 16) +
      0.0722 * parseInt(hex.slice(5, 7), 16)

    const brightest = KEYS.reduce((a, b) => (lum(b.background) > lum(a.background) ? b : a))
    expect(brightest.hour).toBe(TIME_PRESETS.day)

    // Rising to it, then falling away from it.
    const upToDay = KEYS.filter((k) => k.hour <= TIME_PRESETS.day)
    const fromDay = KEYS.filter((k) => k.hour >= TIME_PRESETS.day)
    for (let i = 1; i < upToDay.length; i++) {
      expect(`${upToDay[i].hour}:${lum(upToDay[i].background) >= lum(upToDay[i - 1].background)}`)
        .toBe(`${upToDay[i].hour}:true`)
    }
    for (let i = 1; i < fromDay.length; i++) {
      expect(`${fromDay[i].hour}:${lum(fromDay[i].background) <= lum(fromDay[i - 1].background)}`)
        .toBe(`${fromDay[i].hour}:true`)
    }
    // And night is properly darker than day, not a shade of it.
    const night = KEYS.find((k) => k.hour === TIME_PRESETS.night)!
    expect(lum(night.background)).toBeLessThan(lum(brightest.background) * 0.6)
  })

  it('lowers and warms the sun between day and afternoon', () => {
    // What separates the two brightest presets. Without both moves afternoon
    // is just a slightly dimmer day, which is the trap of tuning by intensity
    // alone — the long shadows come from the elevation.
    const day = KEYS.find((k) => k.hour === TIME_PRESETS.day)!
    const afternoon = KEYS.find((k) => k.hour === TIME_PRESETS.afternoon)!
    expect(afternoon.caster.elevationDeg).toBeLessThan(day.caster.elevationDeg)
    const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16)
    expect(warmth(afternoon.caster.color)).toBeGreaterThan(warmth(day.caster.color))
  })

  it('leaves every artificial light off while the sun is up', () => {
    // Literal zero, not nearly. The interpolator lands exactly on its
    // endpoints for this reason: a window at 0.001 is a lit window, and a city
    // glowing at noon is the clearest possible sign the hour has stopped being
    // an axis and become a switch somewhere.
    for (const hour of [TIME_PRESETS.day, TIME_PRESETS.afternoon]) {
      const k = KEYS.find((key) => key.hour === hour)!
      for (const [name, value] of [
        ['windowGlow', k.city.windowGlow],
        ['lampGlow', k.city.lampGlow],
        ['plateGlow', k.hero.plateGlow],
        ['glassGlow', k.hero.glassGlow],
      ] as const) {
        expect(`${hour} ${name}:${value}`).toBe(`${hour} ${name}:0`)
      }
    }
  })

  it('brings the lights up through dusk rather than switching them on', () => {
    // Every artificial channel has to rise together and monotonically. One that
    // jumps is a light popping on at a threshold, which is exactly what an hour
    // axis exists to avoid.
    const evening = [TIME_PRESETS.afternoon, 18, 19, 20, TIME_PRESETS.night].map(
      (h) => KEYS.find((k) => k.hour === h)!,
    )
    const channels = [
      ['windowGlow', (k: (typeof KEYS)[number]) => k.city.windowGlow],
      ['lampGlow', (k: (typeof KEYS)[number]) => k.city.lampGlow],
      ['glassGlow', (k: (typeof KEYS)[number]) => k.hero.glassGlow],
    ] as const
    for (const [name, read] of channels) {
      for (let i = 1; i < evening.length; i++) {
        const rising = read(evening[i]) >= read(evening[i - 1])
        expect(`${name} ${evening[i].hour}:${rising}`).toBe(`${name} ${evening[i].hour}:true`)
      }
      expect(read(evening[evening.length - 1])).toBeGreaterThan(0)
    }
  })

  it('keeps the tower quieter than the city around it', () => {
    // The hero is one building among hundreds and should not out-shine the
    // district — it earns attention by being the tallest and the only one made
    // of data, never by being the brightest thing on screen.
    const night = KEYS.find((k) => k.hour === TIME_PRESETS.night)!
    expect(night.hero.plateGlow).toBeLessThan(night.city.windowGlow)
    expect(night.hero.glassGlow).toBeLessThan(night.city.windowGlow)
    // And within the tower, glazing over concrete: an office reads by its
    // windows, and glowing plates would turn it into a lantern.
    expect(night.hero.glassGlow).toBeGreaterThan(night.hero.plateGlow)
  })

  it('shows the moon that is doing the lighting', () => {
    // After dark the shadow caster IS the moon, so the disc drawn in the sky
    // and the light throwing shadows on the city have to be the same object.
    // Let them drift and the scene quietly has two moons — one you can see and
    // one you can only infer from the shadows.
    // Azimuth only. Elevation deliberately differs, for the same reason the
    // sun disc's does: the caster must stay high or shadows break, and the
    // visible body must stay low or it is above the top of the frame. What has
    // to agree is the DIRECTION the light comes from, which is what the eye
    // checks against the shadows on the ground.
    const lit = KEYS.filter((k) => k.moonDisc.intensity > 0)
    expect(lit.length).toBeGreaterThan(0)
    for (const k of lit) {
      expect(`${k.hour} az:${k.moonDisc.azimuthDeg}`).toBe(`${k.hour} az:${k.caster.azimuthDeg}`)
      // A narrow band, measured off a render: below about eight the disc is
      // behind the skyline with only its halo clearing the rooftops, and above
      // about twenty it is off the top of the frame entirely.
      const el = k.moonDisc.elevationDeg
      expect(`${k.hour} in frame:${el >= 8 && el <= 20}`).toBe(`${k.hour} in frame:true`)
      expect(`${k.hour} caster high:${k.caster.elevationDeg >= 12}`).toBe(`${k.hour} caster high:true`)
    }
    // And it is the night keys that have one, not some stray daylight hour.
    expect(lit.map((k) => k.hour).sort((a, b) => a - b)).toEqual([0, 4.5, TIME_PRESETS.night])
  })

  it('puts the moon where the opening camera is looking', () => {
    // The moon spent its first render behind the viewer. The default camera
    // sits at azimuth -30 and therefore FACES 150, so a body authored at -55
    // was directly over the audience's shoulder and no amount of brightness
    // would have found it. Anything meant to be seen has to be near 150.
    const facing = cameraConfig.initialAzimuthDeg + 180
    for (const k of KEYS.filter((key) => key.moonDisc.intensity > 0.5)) {
      const off = Math.abs(((k.moonDisc.azimuthDeg - facing + 540) % 360) - 180)
      expect(`${k.hour} degrees off centre:${off < 60}`).toBe(`${k.hour} degrees off centre:true`)
    }
  })

  it('never shows the sun and the moon at once', () => {
    // Both discs are always in the table; what changes is which one is on.
    // Overlapping them is the one combination that cannot be a sky.
    for (const k of KEYS) {
      const both = k.sunDisc.intensity > 0.2 && k.moonDisc.intensity > 0.2
      expect(`${k.hour} both:${both}`).toBe(`${k.hour} both:false`)
    }
  })

  it('keeps the night sky dark and the day sky starless', () => {
    for (const hour of [TIME_PRESETS.day, TIME_PRESETS.afternoon, 7, 18]) {
      const k = KEYS.find((key) => key.hour === hour)!
      expect(`${hour} stars:${k.starIntensity}`).toBe(`${hour} stars:0`)
      expect(`${hour} milkyWay:${k.milkyWay}`).toBe(`${hour} milkyWay:0`)
    }
    const night = KEYS.find((k) => k.hour === TIME_PRESETS.night)!
    expect(night.starIntensity).toBe(1)
    // Subtle by design: a galaxy overhead is a different picture from the one
    // this app is about, and the city is under light pollution besides.
    expect(night.milkyWay).toBeLessThanOrEqual(1)
  })

  it('brings the stars out through dusk', () => {
    const at = (h: number) => KEYS.find((k) => k.hour === h)!.starIntensity
    expect(at(18)).toBe(0)
    expect(at(19)).toBeGreaterThan(at(18))
    expect(at(20)).toBeGreaterThan(at(19))
    expect(at(TIME_PRESETS.night)).toBeGreaterThan(at(20))
  })

  it('gives a transition room without making it a wait', () => {
    const { baseS, perHourS, maxS, scrubS } = timeOfDayConfig.transition
    expect(baseS).toBeGreaterThan(0)
    expect(perHourS).toBeGreaterThan(0)
    expect(maxS).toBeGreaterThan(baseS)
    // Scrubbing retargets on every drag step; anything near the full duration
    // would leave the scene lagging a long way behind the thumb.
    expect(scrubS).toBeLessThan(baseS)
    expect(timeOfDayConfig.autoCycle.hoursPerSecond).toBeGreaterThan(0)
  })
})

describe('a meal names an hour', () => {
  it('gives each meal one of the three hours the control offers', () => {
    // Clicking a column takes the scene to the hour that meal is eaten at. It
    // has to land on a preset: an hour no button could reach leaves the time
    // control showing none of its three as active, which reads as broken.
    const offered: number[] = Object.values(TIME_PRESETS)
    for (const meal of ['Breakfast', 'Lunch', 'Dinner'] as const) {
      expect(`${meal}:${offered.includes(MEAL_HOURS[meal])}`).toBe(`${meal}:true`)
    }
  })

  it('runs the meals through the day in order', () => {
    // Breakfast morning, lunch afternoon, dinner night. Any other assignment
    // is defensible in the abstract and wrong to anyone who has eaten.
    expect(MEAL_HOURS.Breakfast).toBeLessThan(MEAL_HOURS.Lunch)
    expect(MEAL_HOURS.Lunch).toBeLessThan(MEAL_HOURS.Dinner)
    expect(MEAL_HOURS.Breakfast).toBe(TIME_PRESETS.day)
    expect(MEAL_HOURS.Lunch).toBe(TIME_PRESETS.afternoon)
    expect(MEAL_HOURS.Dinner).toBe(TIME_PRESETS.night)
  })
})
