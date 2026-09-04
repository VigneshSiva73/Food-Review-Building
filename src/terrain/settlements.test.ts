import { describe, expect, it } from 'vitest'
import { islandConfig, moduleHeight } from '@/config'
import { buildHeightField, heightAt } from './heightField'
import { buildDwellings, buildSettlements, buildabilityAt } from './settlements'
import { slopeAt } from './vegetation'

const field = buildHeightField()
const places = buildSettlements(field)
const homes = buildDwellings(field, places)

describe('buildSettlements', () => {
  it('founds a spread of places, of more than one kind', () => {
    expect(places.length).toBeGreaterThan(8)
    const kinds = new Set(places.map((p) => p.kind))
    // All one kind means the classifier has collapsed, which it did once: the
    // buildability score saturates, so sorting by it made everything a suburb.
    expect(kinds.size).toBeGreaterThan(1)
  })

  it('keeps them far enough apart to be separate places', () => {
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const d = Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z)
        expect(`${i},${j} apart:${d >= islandConfig.settlements.minSpacing - 0.01}`).toBe(
          `${i},${j} apart:true`,
        )
      }
    }
  })

  it('never builds in the sea, on a cliff, or in the city', () => {
    // §40's placement rules. Asserted on the DWELLINGS rather than the sites,
    // since a site can be good while a plot at its edge is not.
    const s = islandConfig.settlements
    for (const d of homes) {
      const above = heightAt(field, d.x, d.z) - islandConfig.world.seaLevel
      expect(`dry:${above >= s.minAbove}`).toBe('dry:true')
      expect(`buildable:${buildabilityAt(field, d.x, d.z) > s.minPlotScore}`).toBe(
        'buildable:true',
      )
      expect(`gentle:${slopeAt(field, d.x, d.z) < s.slopeHard}`).toBe('gentle:true')
    }
  })

  it('sits every building on the ground it stands on', () => {
    // §40 again: nothing floating, nothing buried.
    for (const d of homes) {
      expect(`grounded:${Math.abs(d.y - heightAt(field, d.x, d.z)) < 0.001}`).toBe(
        'grounded:true',
      )
    }
  })

  it('never grows a skyscraper out on the island', () => {
    // §19 is explicit. The Food Building has to stay the landmark.
    const tallest = Math.max(...homes.map((d) => d.height))
    // A storey of the tower is one module; nothing out here reaches eight.
    expect(tallest).toBeLessThan(moduleHeight() * 8)
    expect(tallest).toBeLessThan(60)
  })

  it('is stable between builds', () => {
    const again = buildDwellings(field, buildSettlements(field))
    expect(again.length).toBe(homes.length)
    expect(again[0].x).toBe(homes[0].x)
  })
})
