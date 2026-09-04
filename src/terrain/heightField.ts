import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { fbm2D, ridged2D, seedFor, valueNoise2D, warp2D } from './noise'

/**
 * The island's terrain, as a grid.
 *
 * A grid rather than a continuous function, deliberately. Drainage is a
 * question about NEIGHBOURS — where does water on this cell go next — and that
 * cannot be answered by a function of one point. Since the rivers, the valleys
 * they cut and the moisture that decides where forest grows all come out of the
 * drainage, the grid is the primary artefact and everything else samples it.
 *
 * Two earlier islands were rejected for looking generated, and both were built
 * from a radius around the tower. Nothing here measures one. The land is a
 * warped noise field thresholded at sea level: the coastline is wherever that
 * field happens to cross, so bays, coves, peninsulas and offshore islets all
 * fall out of the same source rather than being added afterwards as variation.
 */

export interface HeightField {
  /** Cells per side. */
  readonly size: number
  /** Half-extent in world units. */
  readonly half: number
  /** World units per cell. */
  readonly step: number
  /** Elevation per cell, in world units. Sea level is negative. */
  readonly height: Float32Array
  /** Upstream cells draining through each cell. */
  readonly flow: Float32Array
  /**
   * The cell each cell's water flows into, or -1 for none.
   *
   * Recorded while the flow is accumulated and kept, rather than recomputed
   * later from the finished terrain. Carving the channels CHANGES the terrain,
   * so steepest descent on the final heights is not always the route the water
   * actually took — and a river traced that way can step to a cell carrying
   * less water than the one it came from, which is a river that narrows as it
   * goes downstream.
   */
  readonly next: Int32Array
  /** 1 where the city's flat shelf applies, 0 outside, ramped between. */
  readonly shelf: Float32Array
  /**
   * Distance from each land cell to the nearest water, in CELLS.
   *
   * A breadth-first flood out from every sea cell at once, which is linear in
   * the grid and answers a question that would otherwise be a search per query.
   * Everything that cares about the coast reads this: where palms grow, where
   * a village can be a fishing village, and later where a coast road runs.
   */
  readonly shoreDistance: Float32Array
}

/** Hermite ramp, 0 at `edge0`, 1 at `edge1`, clamped. */
function ramp(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * How strongly the city's flat shelf applies at a point.
 *
 * A rounded rectangle on the street grid's own axes, not a disc. Deriving it
 * from the same axes as the roads means the flat area cannot drift out of
 * agreement with them, and it is one less circle in a scene that has been
 * rejected twice for having circles in it.
 */
/**
 * Signed distance to the edge of the city's flat shelf: negative inside the
 * built plain, positive outside it, in world units.
 *
 * Exported because the vegetation needs to know how far OUT it is, not merely
 * how much shelf is left. The weight below saturates at zero a few hundred
 * units past the edge, which is no use for deciding where a treeline belongs.
 */
export function shelfDistanceAt(x: number, z: number, c: IslandConfig = islandConfig): number {
  const { minX, maxX, minZ, maxZ, cornerRadius } = c.shelf
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const dx = Math.abs(x - cx) - ((maxX - minX) / 2 - cornerRadius)
  const dz = Math.abs(z - cz) - ((maxZ - minZ) / 2 - cornerRadius)
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - cornerRadius
  )
}

export function shelfWeightAt(x: number, z: number, c: IslandConfig = islandConfig): number {
  const { minX, maxX, minZ, maxZ, cornerRadius, blendMargin } = c.shelf
  // Signed distance to a rounded box spanning exactly the grid's bounds. The
  // box is centred on the GRID rather than on the origin, which is the whole
  // point: the streets are not symmetric about the tower, so a flat area that
  // is symmetric leaves brown ground on whichever side the grid falls short.
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const dx = Math.abs(x - cx) - ((maxX - minX) / 2 - cornerRadius)
  const dz = Math.abs(z - cz) - ((maxZ - minZ) / 2 - cornerRadius)
  const outside =
    Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - cornerRadius
  if (outside <= 0) return 1
  if (outside >= blendMargin) return 0
  return 1 - ramp(0, blendMargin, outside)
}

/** Raw land surface before any water has touched it. */
function bedrockAt(x: number, z: number, half: number, c: IslandConfig): number {
  const s = c.seed
  const [wx, wz] = warp2D(
    x,
    z,
    seedFor(s, 'land-warp'),
    c.land.warpStrength,
    c.land.warpFrequency,
  )

  // The land mask. Above zero is land; the coastline is the contour where it
  // crosses, which is why the shore is irregular without anything shaping it.
  const mask = fbm2D(wx, wz, seedFor(s, 'land-shape'), c.land.shape) + c.land.bias

  // Only the outermost band is forced under, so the island cannot run off the
  // edge of its own mesh. Everything inside is the noise's business.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / half
  const coastal = mask - ramp(1 - c.land.edgeMargin, 1, edge) * 2

  if (coastal <= 0) {
    // Seabed: keeps falling away from the shore, so shallows are shallow and
    // the deep ocean is deep. §5 wants that gradient to be real, not painted.
    return c.world.seaLevel - 460 * ramp(0, 0.9, -coastal)
  }

  const land = c.world.seaLevel + (c.relief.landAmplitude - c.world.seaLevel) * ramp(0, c.relief.shoreRise, coastal)
  const detail =
    fbm2D(x, z, seedFor(s, 'detail'), c.relief.detail) *
    c.relief.detail.amplitude *
    ramp(0, 0.1, coastal)

  // Mountains gated by their OWN low-frequency field, so several ranges land in
  // different places at different sizes rather than one crown on the high spot.
  const m = c.relief.mountains
  const gate = valueNoise2D(x * m.maskFrequency, z * m.maskFrequency, seedFor(s, 'range-mask'))
  const mountainMask = ramp(m.maskFloor, 0.85, gate) * ramp(0, 0.35, coastal)
  const peaks =
    mountainMask > 0
      ? ridged2D(x, z, seedFor(s, 'ridges'), m.ridged) ** 1.9 * m.amplitude * mountainMask
      : 0

  return land + detail + peaks
}

/**
 * Fill depressions so every cell has somewhere downhill to send its water.
 *
 * Noise terrain is full of closed pits, and a pit swallows the flow that should
 * have continued to the sea — which shows up as rivers that start confidently
 * and then simply stop. Raising each cell to just under its lowest neighbour
 * turns pits into flats that still drain. A few passes is enough; this is not
 * trying to be a hydrology paper.
 */
function fillDepressions(height: Float32Array, size: number, sea: number, passes: number): void {
  const EPS = 0.02
  for (let pass = 0; pass < passes; pass++) {
    let changed = 0
    for (let j = 1; j < size - 1; j++) {
      for (let i = 1; i < size - 1; i++) {
        const n = j * size + i
        const h = height[n]
        if (h <= sea) continue
        let lowest = Infinity
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue
            const v = height[(j + dj) * size + (i + di)]
            if (v < lowest) lowest = v
          }
        }
        if (h <= lowest) {
          height[n] = lowest + EPS
          changed++
        }
      }
    }
    if (changed === 0) break
  }
}

/**
 * Route every cell's water to its steepest downhill neighbour and accumulate.
 *
 * Processing cells from high to low means a cell's own upstream total is final
 * by the time it is reached, so one pass is enough — no iteration, no
 * convergence check. The result is a drainage network: it branches, tributaries
 * join, and the trunk gets bigger toward the sea, all of it a consequence of
 * the terrain rather than a shape anybody drew.
 */
function accumulateFlow(
  height: Float32Array,
  size: number,
  sea: number,
): { flow: Float32Array; next: Int32Array } {
  const flow = new Float32Array(size * size).fill(1)
  const next = new Int32Array(size * size).fill(-1)
  const order = new Int32Array(size * size)
  for (let n = 0; n < order.length; n++) order[n] = n
  // Descending by height. The sort dominates the cost and is still trivial next
  // to the noise sampling that produced the field.
  const sorted = Array.from(order).sort((a, b) => height[b] - height[a])

  for (const n of sorted) {
    const h = height[n]
    if (h <= sea) continue
    const i = n % size
    const j = (n / size) | 0
    if (i === 0 || j === 0 || i === size - 1 || j === size - 1) continue

    let best = -1
    let bestDrop = 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue
        const m = (j + dj) * size + (i + di)
        // Diagonal steps cover more ground, so compare gradients rather than
        // raw drops or the flow prefers diagonals everywhere.
        const drop = (h - height[m]) / (di !== 0 && dj !== 0 ? Math.SQRT2 : 1)
        if (drop > bestDrop) {
          bestDrop = drop
          best = m
        }
      }
    }
    next[n] = best
    if (best >= 0) flow[best] += flow[n]
  }
  return { flow, next }
}

/**
 * Cut the channels the accumulated flow has earned.
 *
 * Incision scales with the square root of flow, so a modest stream reads as a
 * crease and the trunk river as a valley, without the big one becoming a
 * canyon. The cut spreads to neighbouring cells so banks slope into the channel
 * instead of dropping into it — §10's "rivers must not look like trenches" is a
 * geometry problem before it is a texturing one.
 */
function carveChannels(
  height: Float32Array,
  flow: Float32Array,
  size: number,
  sea: number,
  c: IslandConfig,
): void {
  const h = c.hydrology
  const depth = new Float32Array(size * size)
  const span = Math.sqrt(h.channelFull) - Math.sqrt(h.channelThreshold)

  for (let n = 0; n < flow.length; n++) {
    if (height[n] <= sea || flow[n] < h.channelThreshold) continue
    const t = Math.min(1, (Math.sqrt(flow[n]) - Math.sqrt(h.channelThreshold)) / span)
    depth[n] = h.maxIncision * t
  }

  // Spread sideways, so the channel has banks rather than walls.
  const spread = new Float32Array(depth)
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      const n = j * size + i
      if (depth[n] <= 0) continue
      const reach = Math.max(1, Math.round((depth[n] / h.maxIncision) * h.maxBankCells))
      for (let dj = -reach; dj <= reach; dj++) {
        for (let di = -reach; di <= reach; di++) {
          const jj = j + dj
          const ii = i + di
          if (jj < 0 || ii < 0 || jj >= size || ii >= size) continue
          const d = Math.hypot(di, dj)
          if (d > reach) continue
          const falloff = 1 - d / (reach + 1)
          const m = jj * size + ii
          const cut = depth[n] * falloff * falloff
          if (cut > spread[m]) spread[m] = cut
        }
      }
    }
  }

  for (let n = 0; n < height.length; n++) {
    if (spread[n] > 0) height[n] = Math.max(sea - 6, height[n] - spread[n])
  }
}

/**
 * Drown every scrap of land not connected to the city.
 *
 * A thresholded noise field gives a main landmass plus however many others
 * happen to clear sea level, and at the scale this runs at those others are not
 * charming islets — they are three more continents sharing the frame, which is
 * not what "one large irregular island" means. A flood fill from the city keeps
 * exactly the landmass the city stands on and sinks the rest.
 *
 * This is also what guarantees the city is on the island at all rather than on
 * an island of its own, which is precisely how the first attempt at this failed.
 */
function keepMainLandmass(height: Float32Array, size: number, sea: number): void {
  const seen = new Uint8Array(size * size)
  const centre = ((size >> 1) * size + (size >> 1)) | 0
  const stack = [centre]
  seen[centre] = 1

  while (stack.length) {
    const n = stack.pop()!
    const i = n % size
    const j = (n / size) | 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const jj = j + dj
        const ii = i + di
        if (jj < 0 || ii < 0 || jj >= size || ii >= size) continue
        const m = jj * size + ii
        if (seen[m] || height[m] <= sea) continue
        seen[m] = 1
        stack.push(m)
      }
    }
  }

  for (let n = 0; n < height.length; n++) {
    if (height[n] > sea && !seen[n]) height[n] = sea - 12
  }
}

/**
 * Distance to the nearest water, by flooding out from every sea cell at once.
 *
 * Breadth-first rather than a distance transform: the queue is seeded with the
 * whole coastline, so one pass over the grid gives every land cell its distance
 * without ever searching. Cells are counted, not metres — callers multiply by
 * the step when they want world units.
 */
function shoreDistanceField(height: Float32Array, size: number, sea: number): Float32Array {
  const dist = new Float32Array(size * size).fill(Infinity)
  const queue = new Int32Array(size * size)
  let head = 0
  let tail = 0

  for (let n = 0; n < height.length; n++) {
    if (height[n] <= sea) {
      dist[n] = 0
      queue[tail++] = n
    }
  }

  while (head < tail) {
    const n = queue[head++]
    const i = n % size
    const j = (n / size) | 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const jj = j + dj
        const ii = i + di
        if (jj < 0 || ii < 0 || jj >= size || ii >= size) continue
        const m = jj * size + ii
        if (dist[m] !== Infinity) continue
        dist[m] = dist[n] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1)
        queue[tail++] = m
      }
    }
  }
  return dist
}

let cache: HeightField | null = null

export function buildHeightField(c: IslandConfig = islandConfig): HeightField {
  const size = c.world.resolution
  const half = c.world.halfExtent
  const step = (half * 2) / (size - 1)
  const sea = c.world.seaLevel

  const height = new Float32Array(size * size)
  const shelf = new Float32Array(size * size)

  for (let j = 0; j < size; j++) {
    const z = -half + j * step
    for (let i = 0; i < size; i++) {
      const x = -half + i * step
      const n = j * size + i
      const w = shelfWeightAt(x, z, c)
      shelf[n] = w
      const bed = bedrockAt(x, z, half, c)
      // The shelf wins outright where it is full, and is blended out beyond.
      height[n] = w >= 1 ? 0 : bed * (1 - w)
    }
  }

  keepMainLandmass(height, size, sea)
  fillDepressions(height, size, sea, c.hydrology.fillIterations)
  const { flow, next } = accumulateFlow(height, size, sea)
  carveChannels(height, flow, size, sea, c)

  // The city is flat, full stop — carving must not put a river through it.
  for (let n = 0; n < height.length; n++) if (shelf[n] >= 1) height[n] = 0

  const shoreDistance = shoreDistanceField(height, size, sea)

  return { size, half, step, height, flow, next, shelf, shoreDistance }
}

/** Built once and shared; generation is not cheap and nothing mutates it. */
export function heightField(): HeightField {
  if (!cache) cache = buildHeightField()
  return cache
}

/** Bilinear elevation at a world point, for placing anything on the ground. */
export function heightAt(field: HeightField, x: number, z: number): number {
  const fx = (x + field.half) / field.step
  const fz = (z + field.half) / field.step
  const i = Math.min(field.size - 2, Math.max(0, Math.floor(fx)))
  const j = Math.min(field.size - 2, Math.max(0, Math.floor(fz)))
  const tx = Math.min(1, Math.max(0, fx - i))
  const tz = Math.min(1, Math.max(0, fz - j))
  const h = field.height
  const s = field.size
  const a = h[j * s + i]
  const b = h[j * s + i + 1]
  const cc = h[(j + 1) * s + i]
  const d = h[(j + 1) * s + i + 1]
  return (a + (b - a) * tx) * (1 - tz) + (cc + (d - cc) * tx) * tz
}
