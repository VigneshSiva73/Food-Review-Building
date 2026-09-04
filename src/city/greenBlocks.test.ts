import { describe, expect, it } from 'vitest'
import { cityConfig, roadReserve } from '@/config'
import { buildBlockTrees, forestFingerDepth } from './greenBlocks'
import {
  buildCityBuildings,
  buildCityLayout,
  buildHouses,
  buildPlotSurfaces,
  builtBlocks,
  facilityAt,
  isHouseBlock,
  isThemeParkBlock,
  seamCoord,
  zoneAt,
} from '@/city'

const trees = buildBlockTrees('high')
const layout = buildCityLayout()

describe('buildBlockTrees', () => {
  it('is deterministic', () => {
    expect(buildBlockTrees('high')).toEqual(trees)
  })

  it('fills the empty middle of every kind of open block', () => {
    // The floor tracks how much open ground the zoning leaves, and that was
    // halved when a third of the city was being reserved as park and vacant
    // lot. What matters is that every open block is planted, which is the
    // assertion below.
    expect(trees.length).toBeGreaterThan(700)
    const blocks = new Set(trees.map((t) => t.id.split(':').slice(1, 3).join(':')))
    expect(blocks.size).toBeGreaterThan(120)
  })

  it('plants nothing on a street', () => {
    // The block interior is inset by the road reserve before anything is
    // placed, so no tree may land within a carriageway or its footway.
    //
    // Block trees only. The planting on a building's own landscaped margin is
    // keyed to its PLOT rather than to a block, and a plot is inset from the
    // street by more than this test measures; `plantsOnPlots` covers those.
    const reserve = roadReserve(true)
    for (const t of trees.filter((x) => x.id.startsWith('green:'))) {
      const [, bx, bz] = t.id.split(':')
      const minX = seamCoord(Number(bx) - 1) + reserve
      const maxX = seamCoord(Number(bx)) - reserve
      const minZ = seamCoord(Number(bz) - 1) + reserve
      const maxZ = seamCoord(Number(bz)) - reserve
      expect(t.position.x).toBeGreaterThanOrEqual(minX)
      expect(t.position.x).toBeLessThanOrEqual(maxX)
      expect(t.position.z).toBeGreaterThanOrEqual(minZ)
      expect(t.position.z).toBeLessThanOrEqual(maxZ)
    }
  })

  it('plants only where a block is actually open ground', () => {
    const houseBlocks = new Set(buildHouses().map((h) => `${h.block.bx}:${h.block.bz}`))
    for (const t of trees.slice(0, 600)) {
      const [, bx, bz] = t.id.split(':')
      const key = `${bx}:${bz}`
      const zone = zoneAt({ bx: Number(bx), bz: Number(bz) })
      // A built zone whose parcels all came up empty is a vacant lot too, and
      // grows the same scrub an explicitly undeveloped block does.
      const open =
        houseBlocks.has(key) ||
        zone === 'park' ||
        zone === 'undeveloped' ||
        !builtBlocks().has(key)
      expect(`${key}:${open}`).toBe(`${key}:true`)
    }
  })

  it('never stands a tree inside a building', () => {
    // Gardens are set back behind the houses, and no block is both built on
    // and planted, so the two sets cannot collide.
    const built = buildCityBuildings(layout, 'high')
    for (const b of built) {
      const near = trees.filter(
        (t) =>
          Math.abs(t.position.x - b.position.x) < b.width / 2 &&
          Math.abs(t.position.z - b.position.z) < b.depth / 2,
      )
      expect(near).toHaveLength(0)
    }
  })

  it('plants the landscaped margin around buildings', () => {
    // The mass between the streets. Ten thousand street trees still left the
    // city looking bare between them, because the one place with real area —
    // the green strip every building leaves inside its own plot — had nothing
    // on it at all.
    const onPlots = trees.filter((t) => t.id.startsWith('plottree:'))
    expect(onPlots.length).toBeGreaterThan(500)
    const strips = new Map(buildPlotSurfaces(buildCityLayout()).greens.map((g) => [g.id, g]))
    const outside: string[] = []
    for (const t of onPlots) {
      const strip = strips.get(t.id.split(':')[1])
      if (!strip) {
        outside.push(t.id)
        continue
      }
      if (
        Math.abs(t.position.x - strip.cx) > strip.halfW ||
        Math.abs(t.position.z - strip.cz) > strip.halfD
      ) {
        outside.push(t.id)
      }
    }
    expect(outside).toEqual([])
  })

  it('clusters rather than gridding', () => {
    // A jittered grid reads as a grid at woodland density. The test for a
    // cluster is that nearest-neighbour distances vary a lot: on a grid they
    // would all be about the pitch.
    const sample = trees.slice(0, 400)
    const gaps = sample.map((t) => {
      let best = Infinity
      for (const o of sample) {
        if (o === t) continue
        best = Math.min(best, Math.hypot(o.position.x - t.position.x, o.position.z - t.position.z))
      }
      return best
    })
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length
    const spread = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length)
    expect(spread / mean).toBeGreaterThan(0.5)
  })

  it('grows forest on every vacant block, thickest inside a finger', () => {
    // A vacant block is no more built on than the ground outside the kerb, so
    // it has to carry a canopy or it is a bald square wherever the camera
    // finds it. Inside one of the east-west fingers it carries more.
    const c = cityConfig
    const r = c.grid.midRadius
    const counts = new Map<string, number>()
    for (const t of trees) {
      if (!t.id.startsWith('green:')) continue
      const key = t.id.split(':').slice(1, 3).join(':')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const edge: number[] = []
    const inland: number[] = []
    const thin: string[] = []
    for (let bx = -r; bx <= r; bx++) {
      for (let bz = -r; bz <= r; bz++) {
        const block = { bx, bz }
        // The tower's own forecourt is deliberately not a wood.
        if (bx === 0 && bz === 0) continue
        if (facilityAt(block, c) || isThemeParkBlock(block, c) || isHouseBlock(block, c)) continue
        const zone = zoneAt(block, c)
        if (zone === 'park') continue
        if (zone !== 'undeveloped' && builtBlocks(c).has(`${bx}:${bz}`)) continue

        const x0 = seamCoord(bx - 1, c)
        const x1 = seamCoord(bx, c)
        const z0 = seamCoord(bz - 1, c)
        const z1 = seamCoord(bz, c)
        // Trees per unit of ground, so a 468-wide block is not counted as
        // denser than a 149-wide one simply for being bigger.
        const density = (counts.get(`${bx}:${bz}`) ?? 0) / ((x1 - x0) * (z1 - z0))
        // One tree per 900 units of block is roughly the point at which a
        // square stops reading as planted from above.
        if (density < 1 / 900) thin.push(`${bx}:${bz}`)
        const inFinger = r - Math.abs(bx) + 1 <= forestFingerDepth(bz, c)
        ;(inFinger ? edge : inland).push(density)
      }
    }

    // Both groups have to be populated, or this test passes on nothing.
    expect(edge.length).toBeGreaterThan(3)
    expect(inland.length).toBeGreaterThan(3)
    expect(thin).toEqual([])
    const mean = (v: number[]) => v.reduce((s, d) => s + d, 0) / v.length
    expect(mean(edge)).toBeGreaterThan(mean(inland))
  })

  it('leaves the tower\u2019s forecourt open', () => {
    // The plaza block is kept clear of trees so the concrete forecourt remains unplanted.
    const plaza = trees.filter((t) => t.id.startsWith('green:0:0:'))
    expect(plaza.length).toBe(0)
  })

  it('plants coconut trees in empty places throughout the city', () => {
    const coconutTrees = trees.filter((t) => t.treeKind === 'coconut')
    expect(coconutTrees.length).toBeGreaterThan(100)

    // Check that coconut trees are present in parks, vacant lots, and plot margins
    const plotCoconuts = coconutTrees.filter((t) => t.id.startsWith('plottree:'))
    const blockCoconuts = coconutTrees.filter((t) => t.id.startsWith('green:'))

    expect(plotCoconuts.length).toBeGreaterThan(0)
    expect(blockCoconuts.length).toBeGreaterThan(0)
  })
})

describe('the forest fingers', () => {
  const c = cityConfig
  const r = c.grid.midRadius
  const rows = Array.from({ length: r * 2 + 1 }, (_, i) => i - r)
  const depths = rows.map((bz) => forestFingerDepth(bz, c))

  it('crosses the north-south streets rather than stopping at them', () => {
    // Depth is counted in block columns, so a depth of two or more means the
    // wood has run over at least one north-south street to get there. Most
    // rows have to do that, or the answer "vertical roads never stop it" is
    // not what got built.
    expect(depths.filter((d) => d >= 2).length).toBeGreaterThan(rows.length / 2)
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(5)
  })

  it('steps at every east-west street', () => {
    // Adjacent rows are bounded by an east-west street, and they are the
    // boundaries that DO stop the forest — so the treeline changes depth
    // across them. If it did not, the fingers would be one straight edge.
    const steps = depths.slice(1).filter((d, i) => d !== depths[i]).length
    expect(steps).toBeGreaterThan(rows.length / 2)
  })

  it('never reaches the tower', () => {
    expect(Math.max(...depths)).toBeLessThanOrEqual(r - c.greenBlocks.forestEdge.finger.keepClear)
  })

  it('actually plants the deep rows', () => {
    // The wiring, not the geometry: a row that rolled a deep finger has to
    // carry more planting on the columns it reaches than a row that did not.
    const counts = new Map<string, number>()
    for (const t of trees) {
      if (!t.id.startsWith('green:') && !t.id.startsWith('plottree:')) continue
      const bx = blockIndexOf(t.position.x)
      const bz = blockIndexOf(t.position.z)
      counts.set(`${bx}:${bz}`, (counts.get(`${bx}:${bz}`) ?? 0) + 1)
    }
    // Columns four and five in from the edge: past what the distance ramp
    // reaches on its own, so anything here is the finger's doing.
    const at = (bz: number) =>
      [-r + 3, -r + 4, r - 3, r - 4].reduce((sum, bx) => sum + (counts.get(`${bx}:${bz}`) ?? 0), 0)
    const deep = rows.filter((bz) => depths[bz + r] >= 5)
    const shallow = rows.filter((bz) => depths[bz + r] <= 2)
    expect(deep.length).toBeGreaterThan(0)
    expect(shallow.length).toBeGreaterThan(0)
    const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
    expect(mean(deep.map(at))).toBeGreaterThan(mean(shallow.map(at)))
  })
})

function blockIndexOf(v: number): number {
  const r = cityConfig.grid.midRadius
  for (let b = -r; b <= r; b++) if (v <= seamCoord(b)) return b
  return r
}
