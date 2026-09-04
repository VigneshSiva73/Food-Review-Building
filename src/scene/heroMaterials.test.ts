import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildingConfig, materialsConfig, moduleHeight, TIME_PRESETS } from '@/config'
import { GLASS_TILE_FLOORS } from '@/building/facade'
import { variationFor } from '@/building/variation'
import {
  applyHeroTimeOfDay,
  crownGeometry,
  crownLightGeometry,
  crownProfile,
  litMaterials,
  mealTints,
  sharedMaterials,
} from './resources'
import {
  CROWN_OCCUPANCY,
  FLOOR_OCCUPANCY,
  heroCrownNightTexture,
} from './heroGlassNightTexture'
import { presetAt } from './timeOfDay/presetAt'

const tints = mealTints()
const base = new THREE.Color(materialsConfig.structure.color)

describe('meal tints', () => {
  it('reproduces each meal tone when multiplied by the concrete base', () => {
    // `instanceColor` multiplies the material colour in the shader, so what is
    // stored has to be a ratio. Storing the target tone directly is the easy
    // mistake: it applies the concrete colour twice and darkens every pillar,
    // which looks plausible enough in a screenshot to survive review.
    for (const meal of ['Breakfast', 'Lunch', 'Dinner'] as const) {
      const target = new THREE.Color(materialsConfig.mealTint[meal])
      const applied = tints[meal].clone().multiply(base)
      expect(applied.r).toBeCloseTo(target.r, 6)
      expect(applied.g).toBeCloseTo(target.g, 6)
      expect(applied.b).toBeCloseTo(target.b, 6)
    }
  })

  it('stays a nudge, never a recolouring', () => {
    // Height is the only encoding of a rating. If these ever grew into real
    // colour coding they would start competing with it.
    for (const meal of ['Breakfast', 'Lunch', 'Dinner'] as const) {
      for (const channel of ['r', 'g', 'b'] as const) {
        const subtle = Math.abs(tints[meal][channel] - 1) < 0.12
        expect(`${meal}.${channel}:${subtle}`).toBe(`${meal}.${channel}:true`)
      }
    }
  })

  it('tells the three meals apart', () => {
    expect(tints.Breakfast).not.toEqual(tints.Dinner)
    expect(tints.Breakfast.r).toBeGreaterThan(tints.Dinner.r)
  })

  it('is cached, so every pillar shares three Color objects', () => {
    expect(mealTints()).toBe(tints)
  })
})

describe('shared hero materials', () => {
  it('carries each spec through to the live material', () => {
    // Adding a field to MaterialSpec does nothing until `makeStandard` reads
    // it, and a config value that no material ever applies looks exactly like
    // a tuned one in the diff. Every knob is checked against the built object.
    const materials = sharedMaterials()
    const specs = {
      structure: materialsConfig.structure,
      slab: materialsConfig.slab,
      fascia: materialsConfig.fascia,
      support: materialsConfig.support,
    } as const

    for (const [key, spec] of Object.entries(specs)) {
      const material = materials[key as keyof typeof specs]
      expect(`${key}:${material.roughness}`).toBe(`${key}:${spec.roughness}`)
      expect(material.metalness).toBe(spec.metalness)
      expect(`${key}:${material.envMapIntensity}`).toBe(`${key}:${spec.envMapIntensity}`)
    }
  })

  it('separates concrete from steel in how it gathers the environment', () => {
    // The point of the knob: under one sun, what tells brushed steel from
    // concrete is mostly how much environment each one picks up.
    const materials = sharedMaterials()
    expect(materials.support.envMapIntensity).toBeGreaterThan(
      materials.structure.envMapIntensity * 2,
    )
    expect(materials.fascia.envMapIntensity).toBeGreaterThan(materials.slab.envMapIntensity)
  })
})

describe('per-floor concrete shade', () => {
  it('keeps the combined tint close to the base tone', () => {
    // Worst case is the strongest meal ratio meeting the strongest pour shade;
    // the two must not compound into a visibly off-colour floor.
    const amp = buildingConfig.concreteShadeAmplitude
    let worst = 0
    for (const meal of ['Breakfast', 'Lunch', 'Dinner'] as const) {
      for (const shade of [1 - amp, 1 + amp]) {
        for (const channel of ['r', 'g', 'b'] as const) {
          worst = Math.max(worst, Math.abs(tints[meal][channel] * shade - 1))
        }
      }
    }
    expect(worst).toBeLessThan(0.2)
  })

  it('varies floor to floor', () => {
    const shades = ['2026-06-04', '2026-06-05', '2026-06-08'].map(
      (d) => variationFor(d).concreteShade,
    )
    expect(new Set(shades).size).toBe(shades.length)
  })
})

describe('shared hero materials', () => {
  const materials = sharedMaterials()
  /**
   * The lit surfaces of the tower.
   *
   * The crown's beacons are left out and belong out: they are unlit fittings,
   * not surfaces, and carry their state in their colour rather than in an
   * emissive — the same shape the city's street lamps have. Their own daylight
   * rule is asserted where they are.
   */
  type LitKey = Exclude<keyof typeof materials, 'crownLight'>
  const keys = (Object.keys(materials) as (keyof typeof materials)[]).filter(
    (k): k is LitKey => k !== 'crownLight',
  )

  /** How much light a material is throwing off its own surface. */
  const selfLight = (key: LitKey) =>
    materials[key].emissiveIntensity *
    (materials[key].emissive.r + materials[key].emissive.g + materials[key].emissive.b)

  it('lights nothing by itself in daylight', () => {
    // This replaces a guard that forbade emissive outright. Its concern holds
    // wherever the sun is up: a surface glowing at noon is lighting itself
    // rather than being lit, and it shows as a face that stays bright in
    // shadow. What changed is that the rule is now tied to the hour instead of
    // to the whole app, so it has to be asserted after applying one.
    //
    // Both daylight keys, because zero here has to be LITERAL zero — the
    // interpolator lands exactly on its endpoints for this reason, and
    // "almost off" is a lit material.
    for (const hour of [TIME_PRESETS.day, TIME_PRESETS.afternoon]) {
      applyHeroTimeOfDay(presetAt(hour).hero)
      for (const key of keys) {
        expect(`${hour} ${key}:${selfLight(key)}`).toBe(`${hour} ${key}:0`)
      }
    }
  })

  it('lights the tower from inside after dark', () => {
    applyHeroTimeOfDay(presetAt(TIME_PRESETS.night).hero)
    for (const key of keys) {
      expect(`${key}:${selfLight(key) > 0}`).toBe(`${key}:true`)
    }
  })

  it('reads by its windows at night, not by its concrete', () => {
    // An office after dark is legible because of its glazing. Letting the
    // plates out-glow the glass turns the tower into a lantern and loses the
    // one-plate-per-day rhythm the whole building is built to show.
    applyHeroTimeOfDay(presetAt(TIME_PRESETS.night).hero)
    expect(selfLight('glass')).toBeGreaterThan(selfLight('slab'))
    expect(selfLight('slab')).toBeGreaterThan(selfLight('structure'))
  })

  it('comes up through dusk rather than switching on', () => {
    const dusk = selfLight_at(19)
    const blue = selfLight_at(20)
    const night = selfLight_at(TIME_PRESETS.night)
    expect(dusk).toBeGreaterThan(0)
    expect(blue).toBeGreaterThan(dusk)
    expect(night).toBeGreaterThan(blue)
  })

  function selfLight_at(hour: number) {
    applyHeroTimeOfDay(presetAt(hour).hero)
    return selfLight('glass')
  }

  it('still varies the glazing floor to floor', () => {
    // The per-floor tone survived the removal, moved from a glow behind the
    // glass onto the glass itself. Without it the curtain wall reads as one
    // extruded ribbon rather than a stack of days.
    expect(materials.glass.vertexColors).toBe(true)
  })
})

describe('lit-storey materials', () => {
  const lit = litMaterials()

  it('reads as glass with the lights on, not as a tint over dark glass', () => {
    // The effect this replaced was a translucent amber wash, and at low opacity
    // the smoked pane behind it still dominated — the floor just looked
    // slightly warmer. Nearly opaque and emissive is what makes it read as the
    // storey being occupied rather than as the storey being selected.
    for (const m of [lit.hover, lit.selected]) {
      expect(m.opacity).toBeGreaterThan(0.85)
      expect(m.emissiveIntensity).toBeGreaterThan(1)
      expect(m.emissive.getHexString()).toBe(
        new THREE.Color(materialsConfig.litInterior).getHexString(),
      )
      // Both faces, because the glazing it covers is drawn both-sided.
      expect(m.side).toBe(THREE.DoubleSide)
      // Never occludes the structure standing in front of it.
      expect(m.depthWrite).toBe(false)
    }
  })

  it('keeps a selected floor brighter than a merely hovered one', () => {
    // Two floors can be lit at once — the one under the cursor and the one
    // already picked — so they have to be told apart at a glance.
    expect(lit.selected.emissiveIntensity).toBeGreaterThan(lit.hover.emissiveIntensity)
  })

  it('is a lamp colour, warm of white', () => {
    // Office light seen through glass always is. A neutral white reads as a
    // blown-out highlight rather than as a lit room.
    const c = new THREE.Color(materialsConfig.litInterior)
    expect(c.r).toBeGreaterThan(c.g)
    expect(c.g).toBeGreaterThan(c.b)
  })

  it('is cached, so hovering never allocates a material', () => {
    expect(litMaterials()).toBe(lit)
  })
})

describe('the crown after dark', () => {
  it('takes the glazing\'s light rather than the frame\'s warm one', () => {
    // It is glass. Left in the structure group it glowed warm and evenly,
    // which is the one treatment that cannot pass for the floors below it.
    const materials = sharedMaterials()
    applyHeroTimeOfDay({ plateGlow: 0.4, glassGlow: 1.6 })
    expect(materials.crown.emissiveIntensity).toBe(materials.glass.emissiveIntensity)
    expect(materials.crown.emissiveIntensity).not.toBe(materials.structure.emissiveIntensity)
  })

  it('carries beacons that come on with the hour and not before', () => {
    // A crown is lit the way a mast is lit: a countable number of lamps, not a
    // grid of rooms. They are unlit fittings, so their state IS their colour —
    // an off lamp is a different colour from an on one, never a darker one.
    const light = sharedMaterials().crownLight
    applyHeroTimeOfDay({ plateGlow: 0, glassGlow: 0 })
    const off = light.color.getHexString()
    applyHeroTimeOfDay({ plateGlow: 0.014, glassGlow: 0.42 })
    expect(light.color.getHexString()).not.toBe(off)
    // Warmer lit than unlit, which is the direction that reads as "on".
    expect(light.color.r).toBeGreaterThan(light.color.b)
  })

  it('puts a beacon on the point, and some up each rib', () => {
    // The glass stays the tone of an unlit pane; everything countable up there
    // is a lamp. Getting that backwards put a scatter of lit offices up a
    // spire nobody works in.
    const beacons = crownLightGeometry().getAttribute('position')
    expect(beacons.count).toBeGreaterThan(0)
    const rings = crownProfile()
    let top = 0
    for (let i = 0; i < beacons.count; i++) top = Math.max(top, beacons.getY(i))
    expect(top).toBeGreaterThan(rings[rings.length - 1].y - 1)
  })

  it('lights its windows from its own map, not the floors\'', () => {
    // What makes a crown read as a crown is that FEW of its panes are lit, not
    // that all of them are lit faintly — so it gets a sparser map rather than
    // a dimmer copy of the tower's. Dimming the floors' map instead lifts the
    // wall BETWEEN the windows by exactly as much, and the spire goes back to
    // being an evenly glowing lid.
    const materials = sharedMaterials()
    expect(materials.crown.emissiveMap).toBe(heroCrownNightTexture())
    const mean = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0) / xs.length
    expect(mean(CROWN_OCCUPANCY)).toBeLessThan(mean(FLOOR_OCCUPANCY) / 2)
    // White through the map, as the glazing is: the wall tone lives in the
    // map's own background, so a tinted emissive here would shift it.
    expect(materials.crown.emissive.getHexString()).toBe('ffffff')
  })

  it('carries curtain-wall coordinates, so that map has somewhere to land', () => {
    const geom = crownGeometry()
    const uv = geom.getAttribute('uv')
    expect(uv).toBeDefined()
    expect(uv.count).toBe(geom.getAttribute('position').count)
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0)
      expect(uv.getX(i)).toBeLessThanOrEqual(1)
      // One row of the map per storey, so the crown goes on counting floors of
      // windows rather than stretching one over its whole height.
      expect(uv.getY(i)).toBeCloseTo(
        geom.getAttribute('position').getY(i) / (moduleHeight() * GLASS_TILE_FLOORS),
        5,
      )
    }
  })
})
