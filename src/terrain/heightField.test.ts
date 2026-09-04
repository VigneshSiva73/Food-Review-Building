import { describe, expect, it } from 'vitest'
import { cityConfig, islandConfig } from '@/config'
import { districtShadowReach } from '@/city'
import { buildHeightField, heightAt, shelfWeightAt } from './heightField'

const field = buildHeightField()
const SEA = islandConfig.world.seaLevel

describe('the city shelf', () => {
  it('is exactly zero everywhere the city is built', () => {
    // Not "close to zero". Streets, kerbs, plaza and every building footprint
    // are built at y = 0, and depth resolves only about half a scene unit at
    // the distance the city is viewed from — so a millimetre of slope under the
    // roads is z-fighting, not a rounding detail.
    //
    // The city occupies a SQUARE — its street grid — not a disc. Checking a
    // disc through the grid's corner sweeps in ground far out on the axes that
    // no street ever reaches, and forced the flat shelf to be much wider than
    // the city: every surplus unit of it showed as bare brown with nothing on
    // it, which is exactly what the user saw.
    const reach = districtShadowReach()
    const step = reach / 12
    for (let x = -reach; x <= reach; x += step) {
      for (let z = -reach; z <= reach; z += step) {
        expect(`${x.toFixed(0)},${z.toFixed(0)}:${heightAt(field, x, z)}`).toBe(
          `${x.toFixed(0)},${z.toFixed(0)}:0`,
        )
      }
    }
  })

  it('covers the skyline, not just the streets', () => {
    expect(islandConfig.shelf.maxX).toBeGreaterThan(cityConfig.skyline.outerRadius)
    expect(islandConfig.shelf.minX).toBeLessThan(-cityConfig.skyline.outerRadius)
  })

  it('leaves the plain near the city at city level, not above it', () => {
    // The first render put the city at the bottom of a 210-unit crater: the
    // plain settled far above the y = 0 the city is nailed to, and the suburbs
    // would have looked down into it. The relief belongs in the mountains.
    expect(islandConfig.relief.landAmplitude).toBeLessThan(90)
    expect(shelfWeightAt(0, 0)).toBe(1)
    expect(shelfWeightAt(40_000, 40_000)).toBe(0)
  })
})

describe('the landform', () => {
  it('is one island, with the city on it', () => {
    // Everything not connected to the city is drowned, so this is really
    // asserting that the seed search picked a field where the city has land
    // under it — which is how the first attempt at this failed.
    const seen = new Uint8Array(field.size * field.size)
    const start = (field.size >> 1) * field.size + (field.size >> 1)
    const stack = [start]
    seen[start] = 1
    let landmass = 0
    while (stack.length) {
      const n = stack.pop()!
      landmass++
      const i = n % field.size
      const j = (n / field.size) | 0
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj
          const ii = i + di
          if (jj < 0 || ii < 0 || jj >= field.size || ii >= field.size) continue
          const m = jj * field.size + ii
          if (seen[m] || field.height[m] <= SEA) continue
          seen[m] = 1
          stack.push(m)
        }
      }
    }
    let land = 0
    for (let n = 0; n < field.height.length; n++) if (field.height[n] > SEA) land++
    // Every scrap of land belongs to the island the city stands on.
    expect(`connected:${landmass === land}`).toBe('connected:true')
    const fraction = land / field.height.length
    expect(fraction).toBeGreaterThan(0.18)
    expect(fraction).toBeLessThan(0.42)
  })

  it('never reaches the edge of its own mesh', () => {
    // Land running off the mesh is a continent cropped by the domain, and the
    // cut shows as a straight cliff into the sea.
    const s = field.size
    for (let k = 0; k < s; k++) {
      for (const n of [k, (s - 1) * s + k, k * s, k * s + s - 1]) {
        expect(`edge ${n}:${field.height[n] <= SEA}`).toBe(`edge ${n}:true`)
      }
    }
  })

  it('has mountains worth the name, and keeps them under the tower', () => {
    let peak = -Infinity
    for (let n = 0; n < field.height.length; n++) peak = Math.max(peak, field.height[n])
    expect(peak).toBeGreaterThan(380)
    // The building is the data visualisation; scenery must never out-rank it.
    expect(peak).toBeLessThan(900)
  })

  it('is byte-identical between builds', () => {
    const again = buildHeightField()
    expect(again.height[12_345]).toBe(field.height[12_345])
    expect(again.flow[45_678]).toBe(field.flow[45_678])
  })
})

describe('drainage', () => {
  it('collects into channels rather than spreading evenly', () => {
    // The tell that this is a river network and not a noise texture: flow has
    // to be wildly unequal, a few cells carrying what thousands shed.
    const sorted = Array.from(field.flow).sort((a, b) => b - a)
    const total = sorted.reduce((a, b) => a + b, 0)
    const topPercent = sorted.slice(0, Math.floor(sorted.length * 0.01))
    const share = topPercent.reduce((a, b) => a + b, 0) / total
    expect(share).toBeGreaterThan(0.3)
  })

  it('carries its biggest rivers all the way to the sea', () => {
    // A river that stops inland is a pit that swallowed it, which is what the
    // depression fill exists to prevent.
    // Measured over EVERY cell, not just the ones still above water. Carving
    // drops the biggest channels below sea level at their mouths, so counting
    // only dry cells reports the largest river as smaller the better it is cut
    // — which is the opposite of what this is trying to assert.
    // Measured over the NATURAL land only. The city's shelf is a large flat
    // plain by construction, and filling depressions across a flat pools water
    // there — so counting it makes the island's real drainage look like a
    // smaller and smaller share of a puddle that is not a river at all.
    let peakFlow = 0
    for (let n = 0; n < field.flow.length; n++) {
      if (field.shelf[n] > 0.02) continue
      peakFlow = Math.max(peakFlow, field.flow[n])
    }
    // Pinned against what the drainage actually produces: the channel config
    // was first tuned to a figure twice this, so nothing was ever fully cut.
    expect(peakFlow).toBeGreaterThan(1200)
    expect(islandConfig.hydrology.channelFull).toBeLessThan(peakFlow)

    // Does a big river actually arrive at the coast? Asserted directly, by
    // looking for high flow in a cell that touches water, rather than by
    // walking downhill from the mouth. The walk was fragile for a real reason:
    // filling depressions leaves FLATS, and a walk that demands a strictly
    // downhill step stops dead on one and reports a perfectly good river as
    // landlocked.
    let bestAtCoast = 0
    for (let j = 1; j < field.size - 1; j++) {
      for (let i = 1; i < field.size - 1; i++) {
        const n = j * field.size + i
        if (field.height[n] <= SEA) continue
        let touchesSea = false
        for (let dj = -1; dj <= 1 && !touchesSea; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (field.height[(j + dj) * field.size + (i + di)] <= SEA) {
              touchesSea = true
              break
            }
          }
        }
        if (touchesSea && field.flow[n] > bestAtCoast) bestAtCoast = field.flow[n]
      }
    }
    // A real river mouth, not a trickle: a decent share of the island's largest
    // flow has to make it all the way to the water.
    expect(bestAtCoast).toBeGreaterThan(peakFlow * 0.25)
  })
})
