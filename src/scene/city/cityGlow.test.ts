// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TIME_PRESETS } from '@/config'
import { presetAt } from '@/scene/timeOfDay/presetAt'
import {
  applyCityTimeOfDay,
  cityFacadeMaterials,
  cityMaterials,
  disposeCityResources,
} from './cityResources'

/**
 * A 2D context stub, because jsdom has none.
 *
 * The city's materials carry procedural canvas textures, and jsdom returns null
 * from `getContext('2d')` — so without this the module cannot even be
 * constructed here. Nothing about the PIXELS is under test: what is being
 * pinned is that the hour reaches the materials, and for that the textures only
 * have to exist. The painting itself is covered where it can be seen, in a
 * screenshot.
 */
beforeAll(() => {
  const gradient = { addColorStop: () => {} }
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    fillRect: () => {},
    // The night tile starts from a copy of the day tile, so the stub has to
    // accept one being blitted into it.
    drawImage: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  }
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof
    HTMLCanvasElement.prototype.getContext
})

afterAll(() => disposeCityResources())

/** Total self-light a material is throwing off its own surface. */
const selfLight = (m: { emissiveIntensity: number; emissive: { r: number; g: number; b: number } }) =>
  m.emissiveIntensity * (m.emissive.r + m.emissive.g + m.emissive.b)

describe('applyCityTimeOfDay', () => {
  it('leaves the city entirely unlit in daylight', () => {
    // The whole district is lit by the sun at noon and nothing else. A window
    // still glowing at midday is the tell that a glow level failed to reach
    // zero, and "almost off" is a lit material — which is why the interpolator
    // lands exactly on its endpoints.
    for (const hour of [TIME_PRESETS.day, TIME_PRESETS.afternoon]) {
      applyCityTimeOfDay(presetAt(hour).city)
      for (const [family, m] of Object.entries(cityFacadeMaterials())) {
        expect(`${hour} ${family}:${selfLight(m)}`).toBe(`${hour} ${family}:0`)
      }
      expect(`${hour} skyline:${selfLight(cityMaterials().skyline)}`).toBe(`${hour} skyline:0`)
    }
  })

  it('lights the windows and the far skyline after dark', () => {
    applyCityTimeOfDay(presetAt(TIME_PRESETS.night).city)
    for (const [family, m] of Object.entries(cityFacadeMaterials())) {
      expect(`${family}:${selfLight(m) > 0}`).toBe(`${family}:true`)
    }
    // Without this the far silhouette falls to a black band the moment the sun
    // leaves it, and reads as a hole in the horizon rather than as distance.
    expect(selfLight(cityMaterials().skyline)).toBeGreaterThan(0)
  })

  it('turns a street lamp a different colour, not a darker one', () => {
    // Dead glass reads cold and grey; a lit lens reads warm. Dimming one
    // colour toward black gives a grey lamp at dusk and a black one at noon,
    // neither of which is what an unlit lamp looks like.
    const lens = cityMaterials().lampLens
    applyCityTimeOfDay(presetAt(TIME_PRESETS.day).city)
    const unlit = lens.color.clone()
    applyCityTimeOfDay(presetAt(TIME_PRESETS.night).city)
    const lit = lens.color.clone()

    expect(lit.r).toBeGreaterThan(unlit.r)
    // Warm when lit, neutral when not — a hue change, not just a brightness one.
    expect(lit.r - lit.b).toBeGreaterThan(unlit.r - unlit.b + 0.1)
  })

  it('comes up through dusk instead of switching on', () => {
    // Lamps that pop on at a threshold are the giveaway that the hour is a
    // switch rather than an axis.
    const office = cityFacadeMaterials().office
    const at = (hour: number) => {
      applyCityTimeOfDay(presetAt(hour).city)
      return selfLight(office)
    }
    const golden = at(18)
    const sunset = at(19)
    const blue = at(20)
    const night = at(TIME_PRESETS.night)
    expect(golden).toBeGreaterThan(0)
    expect(sunset).toBeGreaterThan(golden)
    expect(blue).toBeGreaterThan(sunset)
    expect(night).toBeGreaterThan(blue)
  })

  it('survives being called before the city exists', () => {
    // The driver writes every frame from the moment it mounts, and the city's
    // materials are built lazily on its first render — which may be never, if
    // the city is switched off. A missing cache has to be ordinary rather than
    // an exception in the middle of an animation.
    disposeCityResources()
    expect(() => applyCityTimeOfDay(presetAt(TIME_PRESETS.night).city)).not.toThrow()
  })
})
