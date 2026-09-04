import { cityConfig, roadReserve, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { blockRing, buildCityLayout, districtReach, seamCoord } from './cityLayout'
import { builtBlocks } from './cityBuildings'
import { facilityAt } from './civic'
import { buildPlotSurfaces } from './parking'
import { buildPlaygrounds } from './playgrounds'
import { isThemeParkBlock } from './themePark'
import { isHouseBlock } from './houses'
import type { BlockCoord, TreePlacement } from './types'
import { zoneAt } from './zoning'

/**
 * The trees inside a block, as opposed to the ones along its streets.
 *
 * Three kinds of empty ground needed filling and all three read as bare paving
 * from above: the middle of a house block, which is everybody's back garden; a
 * park block, which had nothing in it at all; and an undeveloped block, which
 * is meant to look like land nobody has built on rather than like tarmac.
 *
 * Placement is by CLUSTER, not by grid. A jittered grid still reads as a grid
 * at any density high enough to look like woodland — the eye finds the rows —
 * so each block gets a few centres and the trees gather around them, which is
 * how trees actually stand when nobody planted them in a line.
 */

interface Interior {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** The plantable middle of a block, once its frontage is accounted for. */
function interiorOf(block: BlockCoord, inset: number, c: CityConfig): Interior | null {
  const reserve = roadReserve(true, c) + inset
  const minX = seamCoord(block.bx - 1, c) + reserve
  const maxX = seamCoord(block.bx, c) - reserve
  const minZ = seamCoord(block.bz - 1, c) + reserve
  const maxZ = seamCoord(block.bz, c) - reserve
  if (maxX - minX < 12 || maxZ - minZ < 12) return null
  return { minX, maxX, minZ, maxZ }
}

/**
 * How hard the forest presses on this point: 1 at the city's rim, 0 inland.
 *
 * The shelf is the flat plain the streets are laid on and the island's forest
 * starts the moment the ground leaves it, so the shelf's own signed distance is
 * the honest answer to "how near the woods is this". Read through its
 * rounded-box SDF, which is grid-derived — not a radius from the tower, and not
 * an angle.
 */
/** Which block column or row a world coordinate falls in. */
function blockIndexAt(v: number, c: CityConfig): number {
  const r = c.grid.midRadius
  for (let b = -r; b <= r; b++) if (v <= seamCoord(b, c)) return b
  return r
}

/**
 * How deep the forest reaches in from the east and west edges on this row, in
 * block columns.
 *
 * The wood comes in along whole ROWS on those two sides. A row is bounded
 * above and below by the east-west streets that define it and those are what
 * stop the forest; the north-south streets it crosses on the way do not, so a
 * finger simply runs over them. Seeded per row, so the treeline interlocks
 * with the city instead of ending on a straight line.
 */
export function forestFingerDepth(bz: number, c: CityConfig = cityConfig): number {
  const f = c.greenBlocks.forestEdge.finger
  const rng = rngFrom(`${c.seed}:forestfinger:${bz}`)
  return Math.min(c.grid.midRadius - f.keepClear, rng.int(f.min, f.max))
}

/** The east-west fingers, as a weight: 1 inside one, half in its last column. */
function fingerWeight(bx: number, bz: number, c: CityConfig): number {
  // 1 for the outermost column, 2 for the next in, and so on.
  const into = c.grid.midRadius - Math.abs(bx) + 1
  const depth = forestFingerDepth(bz, c)
  if (into > depth) return 0
  // The innermost column is the fray, so a finger tapers into the city rather
  // than ending at a wall.
  return into === depth ? 0.5 : 1
}

/**
 * The forest's pull on a point.
 *
 * The fingers and nothing else. There used to be a distance ramp underneath
 * them that pulled the wood in from all four sides at once, and that is the
 * wrong shape: only the two sides that END on a north-south street take the
 * forest inward, because only there is there a street for it to cross. The
 * north and south edges close on their own east-west street and stop.
 */
function edgeWeightAt(x: number, z: number, c: CityConfig): number {
  return fingerWeight(blockIndexAt(x, c), blockIndexAt(z, c), c)
}

function blockEdgeWeight(block: BlockCoord, c: CityConfig): number {
  return fingerWeight(block.bx, block.bz, c)
}

/**
 * Trees on the landscaped margin around every building.
 *
 * Six hundred plots of green strip, and until this there was not a tree on any
 * of it — which is most of why a city with ten thousand street trees still
 * looked bare BETWEEN the streets. The street planting draws lines; this is
 * the mass between them, and from any camera above the rooftops it is what
 * actually reads as a city with trees in it.
 *
 * Scattered by area rather than by count, so a deep margin behind a small
 * building gets a stand of trees and a two-metre strip beside a big one gets
 * one or none.
 */
function plotTrees(
  density: keyof CityConfig['density'],
  near: number,
  c: CityConfig,
): TreePlacement[] {
  const g = c.greenBlocks.plot
  const f = c.greenBlocks.forestEdge
  const thin = 1 / c.density[density].propScale
  const out: TreePlacement[] = []

  for (const strip of buildPlotSurfaces(buildCityLayout(c), c).greens) {
    const w = strip.halfW * 2 - g.inset * 2
    const d = strip.halfD * 2 - g.inset * 2
    if (w <= 2 || d <= 2) continue
    const rng = rngFrom(`${c.seed}:plottrees:${strip.id}`)
    // Out at the rim the wood runs between the buildings, so the margin round
    // each one is planted heavily and its cap lifted — the cap, not the
    // density, is what was leaving these strips with one tree on them.
    const edge = edgeWeightAt(strip.cx, strip.cz, c)
    const cap = Math.round(g.cap * (1 + edge * f.plotCap))
    const count = Math.min(cap, Math.round(((w * d) / g.areaPer) * (1 + edge * f.plot) * thin))

    for (let i = 0; i < count; i++) {
      const x = strip.cx + rng.range(-w / 2, w / 2)
      const z = strip.cz + rng.range(-d / 2, d / 2)
      const isCoconut = rng.next() < 0.55
      const height = isCoconut ? rng.range(7.5, 12.0) : rng.range(g.height.min, g.height.max)
      out.push({
        id: `plottree:${strip.id}:${i}`,
        position: { x, z },
        baseY: 0,
        height,
        canopyRadius: isCoconut ? height * rng.range(0.4, 0.52) : height * rng.range(0.3, 0.46),
        rotationY: rng.range(0, Math.PI * 2),
        variant: rng.next(),
        detail: Math.max(Math.abs(x), Math.abs(z)) > near ? 'far' : 'near',
        treeKind: isCoconut ? 'coconut' : 'standard',
      })
    }
  }
  return out
}

export function buildBlockTrees(
  density: keyof CityConfig['density'] = 'high',
  c: CityConfig = cityConfig,
): TreePlacement[] {
  const g = c.greenBlocks
  // Thinned on the lower tiers by the same scale the street planting uses, so
  // a phone gets a sparser wood rather than a cropped one.
  const thin = 1 / c.density[density].propScale
  const r = c.grid.midRadius
  const near = districtReach(c)
  const out: TreePlacement[] = []
  const playgrounds = buildPlaygrounds(c)

  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      // A facility lands its own landscaping; a wood across its car park is
      // not landscaping.
      if (facilityAt(block, c)) continue
      // The park lands its own planting, clear of the midway and the rides.
      if (isThemeParkBlock(block, c)) continue
      const zone = zoneAt(block, c)
      const houses = isHouseBlock(block, c)

      // What this block is, for planting purposes. A house block is gardens
      // whatever its zone says; otherwise only green and vacant land is
      // planted, because a built block's middle is its buildings.
      const kind = houses
        ? g.garden
        : zone === 'park'
          ? g.park
          : // Explicitly undeveloped, or a built zone whose parcels all came
            // up empty: both are vacant lots, and a vacant lot grows WOODLAND.
            // Scrub is what the tower's own forecourt gets and nothing else —
            // a thin scatter reads as bare ground from above, which is exactly
            // the bald square the forest was running into.
            zone === 'undeveloped' || !builtBlocks(c).has(`${bx}:${bz}`)
            ? blockRing(block) === 0
              ? null
              : g.woodland
            : null
      if (!kind) continue
      // How much extra this kind of ground takes at the rim. Scrub — the
      // tower's forecourt, and nothing else — takes none.
      const boost =
        kind === g.woodland
          ? g.forestEdge.woodland
          : kind === g.garden
            ? g.forestEdge.garden
            : kind === g.park
              ? g.forestEdge.park
              : 0

      // Gardens start behind the houses; a park runs up to its own footway.
      const area = interiorOf(block, kind.inset, c)
      if (!area) continue

      // A playground is a clearing: trees round it, not through it.
      const clearings = playgrounds.filter((p) => p.block.bx === bx && p.block.bz === bz)
      const rng = rngFrom(`${c.seed}:blocktrees:${bx}:${bz}`)
      const span = Math.min(area.maxX - area.minX, area.maxZ - area.minZ)
      // Bigger blocks get proportionally more centres, so a 400-unit block is
      // not as sparse as a 130-unit one.
      // Thicker the nearer the treeline, so the city's woods and the island's
      // close with each other instead of meeting at a step.
      const edge = blockEdgeWeight(block, c) * boost
      const clusters = Math.max(
        1,
        Math.round((span / c.grid.pitch) * kind.clusters * (1 + edge) * thin),
      )

      for (let ci = 0; ci < clusters; ci++) {
        const cx = rng.range(area.minX, area.maxX)
        const cz = rng.range(area.minZ, area.maxZ)
        const count = rng.int(kind.perCluster.min, kind.perCluster.max)

        for (let i = 0; i < count; i++) {
          // Square-rooted radius, so a cluster is dense in the middle and
          // frays at its edge rather than being a uniform disc of trees.
          const radius = Math.sqrt(rng.next()) * kind.radius
          const angle = rng.next() * Math.PI * 2
          const x = cx + Math.cos(angle) * radius
          const z = cz + Math.sin(angle) * radius
          if (x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ) continue
          if (clearings.some((p) => Math.hypot(x - p.centre.x, z - p.centre.z) < p.radius)) {
            continue
          }

          const id = `green:${bx}:${bz}:${ci}:${i}`
          const isCoconut =
            kind === g.woodland
              ? rng.next() < 0.70
              : kind === g.park
                ? rng.next() < 0.75
                : rng.next() < 0.40
          const height = isCoconut
            ? rng.range(Math.min(7.5, kind.height.min), Math.min(12.0, kind.height.max))
            : rng.range(kind.height.min, kind.height.max)
          out.push({
            id,
            position: { x, z },
            baseY: 0,
            height,
            canopyRadius: isCoconut ? height * rng.range(0.4, 0.52) : height * rng.range(0.3, 0.46),
            rotationY: rng.range(0, Math.PI * 2),
            variant: rng.next(),
            detail: Math.max(Math.abs(x), Math.abs(z)) > near ? 'far' : 'near',
            treeKind: isCoconut ? 'coconut' : 'standard',
          })
        }
      }
    }
  }
  return [...out, ...plotTrees(density, near, c)]
}
