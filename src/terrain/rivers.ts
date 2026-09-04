import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import type { HeightField } from './heightField'

/**
 * The rivers, traced out of the drainage that already exists.
 *
 * Nothing here decides where a river goes. The flow field computed when the
 * terrain was built already knows how much water passes through every cell, and
 * the channels were cut from it — so a river is found by starting where enough
 * water first collects and walking downhill the same way the water did. That is
 * why they branch, why tributaries meet, and why the trunk is widest at the
 * coast: §9's hierarchy is a consequence, not a design.
 */

export interface RiverPoint {
  x: number
  z: number
  /** Terrain elevation at this point. */
  y: number
  /** Half-width of the water surface here. */
  halfWidth: number
  /** Drop to the next point downstream, in world units. */
  drop: number
}

export type River = RiverPoint[]

function cellXZ(field: HeightField, n: number): [number, number] {
  const i = n % field.size
  const j = (n / field.size) | 0
  return [-field.half + i * field.step, -field.half + j * field.step]
}

export function buildRivers(field: HeightField, c: IslandConfig = islandConfig): River[] {
  const r = c.rivers
  const sea = c.world.seaLevel
  // Looped, not spread. `Math.max(...field.flow)` on a third of a million
  // cells overflows the call stack — it would have thrown in the browser on
  // first load exactly as it did in the test.
  let peak = 0
  for (let i = 0; i < field.flow.length; i++) if (field.flow[i] > peak) peak = field.flow[i]
  const visited = new Uint8Array(field.size * field.size)
  const rivers: River[] = []

  /**
   * Sources: the first cell on each watercourse to carry enough water to be
   * worth drawing. Found by asking whether any UPSTREAM neighbour already
   * qualifies — if none does, this is where the river starts.
   */
  const isSource = (n: number): boolean => {
    if (field.flow[n] < r.minFlow || field.height[n] <= sea) return false
    const i = n % field.size
    const j = (n / field.size) | 0
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const m = (j + dj) * field.size + (i + di)
        if (m < 0 || m >= field.flow.length) continue
        // An upstream neighbour is one that drains INTO this cell.
        if (field.flow[m] >= r.minFlow && field.next[m] === n) return false
      }
    }
    return true
  }

  const widthAt = (flow: number) => {
    const t = Math.min(1, Math.sqrt(flow / peak))
    return (r.minWidth + (r.maxWidth - r.minWidth) * t) / 2
  }

  for (let n = 0; n < field.flow.length; n++) {
    if (!isSource(n)) continue

    const path: River = []
    let cur = n
    for (let step = 0; step < r.maxSteps; step++) {
      // A confluence: the trunk below this point is already drawn, and drawn at
      // its own — larger — width, so there is nothing to add by continuing.
      if (visited[cur]) break
      visited[cur] = 1

      // The city's ground is flat and built on; a river is not routed through it.
      if (field.shelf[cur] > 0.02) break

      const [x, z] = cellXZ(field, cur)
      const next = field.next[cur]
      const drop = next >= 0 ? field.height[cur] - field.height[next] : 0
      path.push({ x, z, y: field.height[cur], halfWidth: widthAt(field.flow[cur]), drop })

      if (next < 0 || field.height[next] <= sea) break
      cur = next
    }

    // Short stubs are noise rather than rivers.
    if (path.length >= r.minPoints) rivers.push(path)
  }

  return rivers
}
