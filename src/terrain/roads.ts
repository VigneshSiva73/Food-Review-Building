import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { HeightField } from './heightField'
import type { Settlement } from './settlements'

/**
 * The road network, found by least cost rather than drawn.
 *
 * §21 and §22 ask for roads that follow the terrain, avoid grids and straight
 * lines, and switchback rather than climb straight over a mountain. None of
 * that is achievable by drawing curves — it is what falls out of asking the
 * cheapest way to get somewhere across ground where climbing is expensive.
 *
 * ONE search does the whole network. Dijkstra is seeded with every cell of the
 * city at once, so its predecessor tree spans the island, and each settlement's
 * road is the chain of predecessors back to the city. Because those chains
 * SHARE predecessors wherever they coincide, roads merge into trunks on their
 * own — which is the difference between a network and a star of spokes radiating
 * from the tower.
 */

export interface RoadPoint {
  x: number
  z: number
  y: number
  /** How many settlements use this segment; trunk roads are wider. */
  traffic: number
}

export type Road = RoadPoint[]

/** Binary min-heap over (cost, node). Flat arrays: this runs a lot. */
class Heap {
  private cost: Float64Array
  private node: Int32Array
  private size = 0

  constructor(capacity: number) {
    this.cost = new Float64Array(capacity)
    this.node = new Int32Array(capacity)
  }

  push(cost: number, node: number): void {
    let i = this.size++
    this.cost[i] = cost
    this.node[i] = node
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.cost[parent] <= this.cost[i]) break
      this.swap(parent, i)
      i = parent
    }
  }

  pop(): number {
    const top = this.node[0]
    this.size--
    if (this.size > 0) {
      this.cost[0] = this.cost[this.size]
      this.node[0] = this.node[this.size]
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let best = i
        if (l < this.size && this.cost[l] < this.cost[best]) best = l
        if (r < this.size && this.cost[r] < this.cost[best]) best = r
        if (best === i) break
        this.swap(best, i)
        i = best
      }
    }
    return top
  }

  get empty(): boolean {
    return this.size === 0
  }

  private swap(a: number, b: number): void {
    const c = this.cost[a]
    this.cost[a] = this.cost[b]
    this.cost[b] = c
    const n = this.node[a]
    this.node[a] = this.node[b]
    this.node[b] = n
  }
}

/** A finished least-cost search over the road lattice. */
export interface CostField {
  size: number
  step: number
  dist: Float64Array
  prev: Int32Array
  /** Terrain cell index for a lattice node. */
  cellFor(node: number): number
}

export interface CostWeights {
  /** How dearly a route pays for gradient, squared. */
  gradePenalty: number
  bridgeFlow: number
  bridgeCost: number
  sharedDiscount: number
}

/**
 * Least cost from a set of seed nodes across the whole island.
 *
 * Shared by roads and trails, which differ only in what they are willing to
 * climb and where they start. Keeping one implementation means a trail can
 * never disagree with a road about what the terrain costs.
 */
export function leastCostFrom(
  field: HeightField,
  seeds: Iterable<number>,
  weights: CostWeights,
  c: IslandConfig = islandConfig,
  /** Terrain cells the route may not enter — the city's blocks, in practice. */
  blocked?: Uint8Array,
): CostField {
  const sea = c.world.seaLevel
  const stride = c.roads.stride
  const size = Math.floor(field.size / stride)
  const step = field.step * stride
  const nodes = size * size
  const cellFor = (node: number) => {
    const i = node % size
    const j = (node / size) | 0
    return j * stride * field.size + i * stride
  }

  const dist = new Float64Array(nodes).fill(Infinity)
  const prev = new Int32Array(nodes).fill(-1)
  const done = new Uint8Array(nodes)
  const heap = new Heap(nodes * 8)

  for (const seed of seeds) {
    if (seed < 0 || seed >= nodes) continue
    dist[seed] = 0
    heap.push(0, seed)
  }

  while (!heap.empty) {
    const n = heap.pop()
    if (done[n]) continue
    done[n] = 1
    const i = n % size
    const j = (n / size) | 0
    const hn = field.height[cellFor(n)]

    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const ii = i + di
        const jj = j + dj
        if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue
        const m = jj * size + ii
        if (done[m]) continue

        const cell = cellFor(m)
        const hm = field.height[cell]
        if (hm <= sea) continue
        if (blocked?.[cell]) continue

        const run = (di !== 0 && dj !== 0 ? Math.SQRT2 : 1) * step
        const grade = Math.abs(hm - hn) / run
        let cost = run * (1 + weights.gradePenalty * grade * grade)
        if (field.flow[cell] > weights.bridgeFlow) cost += weights.bridgeCost
        if (dist[m] < Infinity) cost *= weights.sharedDiscount

        const next = dist[n] + cost
        if (next < dist[m]) {
          dist[m] = next
          prev[m] = n
          heap.push(next, m)
        }
      }
    }
  }

  return { size, step, dist, prev, cellFor }
}

/** Walk a node home along the predecessor tree, counting shared use. */
export function traceHome(
  field: HeightField,
  cost: CostField,
  start: number,
  traffic: Map<number, number>,
  limit: number,
): RoadPoint[] {
  if (cost.dist[start] === Infinity) return []
  const out: RoadPoint[] = []
  let n = start
  let guard = 0
  while (n >= 0 && guard++ < limit) {
    traffic.set(n, (traffic.get(n) ?? 0) + 1)
    const i = n % cost.size
    const j = (n / cost.size) | 0
    out.push({
      x: -field.half + i * cost.step,
      z: -field.half + j * cost.step,
      y: field.height[cost.cellFor(n)],
      traffic: traffic.get(n) ?? 1,
    })
    if (cost.dist[n] === 0) break
    n = cost.prev[n]
  }
  return out
}

/** Lattice node nearest a world point. */
export function nodeAt(field: HeightField, cost: CostField, x: number, z: number): number {
  const i = Math.min(cost.size - 1, Math.max(0, Math.round((x + field.half) / cost.step)))
  const j = Math.min(cost.size - 1, Math.max(0, Math.round((z + field.half) / cost.step)))
  return j * cost.size + i
}

export function buildRoads(
  field: HeightField,
  settlements: Settlement[],
  c: IslandConfig = islandConfig,
  /**
   * Where the network may touch the city. Without it the search is seeded from
   * the whole shelf and a road stops at the first square of city ground it
   * reaches — which is how the network came to end short of the grid, in the
   * open, instead of joining a street.
   */
  access?: { seeds: number[]; blocked: Uint8Array },
): Road[] {
  const r = c.roads
  const stride = r.stride
  const size = Math.floor(field.size / stride)

  // Seeded from the whole city at once, so every road ends up connected to it
  // and the search runs once for the entire island rather than once per place.
  const seeds: number[] = access?.seeds ?? []
  if (!access) {
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        if (field.shelf[j * stride * field.size + i * stride] >= 0.9) seeds.push(j * size + i)
      }
    }
  }

  const cost = leastCostFrom(field, seeds, r, c, access?.blocked)
  const traffic = new Map<number, number>()
  const roads: Road[] = []
  for (const place of settlements) {
    const chain = traceHome(field, cost, nodeAt(field, cost, place.x, place.z), traffic, size * size)
    if (chain.length >= r.minPoints) roads.push(chain)
  }
  return roads
}

/** Every lattice node a finished road passes through. Trails start from these. */
export function roadNodes(field: HeightField, roads: Road[], c: IslandConfig = islandConfig): Set<number> {
  const stride = c.roads.stride
  const size = Math.floor(field.size / stride)
  const step = field.step * stride
  const out = new Set<number>()
  for (const road of roads) {
    for (const p of road) {
      const i = Math.min(size - 1, Math.max(0, Math.round((p.x + field.half) / step)))
      const j = Math.min(size - 1, Math.max(0, Math.round((p.z + field.half) / step)))
      out.add(j * size + i)
    }
  }
  return out
}

/**
 * Corner-cutting, so a road is a curve rather than a lattice path.
 *
 * The search moves on a grid and can only step in eight directions, which shows
 * as staircase kinks on any diagonal. Two Chaikin passes round those off
 * without moving the road off the line it chose.
 */
export function smoothRoad(road: Road, passes = 2): Road {
  let out = road
  for (let pass = 0; pass < passes; pass++) {
    if (out.length < 3) return out
    const next: Road = [out[0]]
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i]
      const b = out[i + 1]
      next.push({
        x: a.x * 0.75 + b.x * 0.25,
        z: a.z * 0.75 + b.z * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        traffic: Math.max(a.traffic, b.traffic),
      })
      next.push({
        x: a.x * 0.25 + b.x * 0.75,
        z: a.z * 0.25 + b.z * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        traffic: Math.max(a.traffic, b.traffic),
      })
    }
    next.push(out[out.length - 1])
    out = next
  }
  return out
}
