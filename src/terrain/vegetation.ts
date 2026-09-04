import { nearSeam, seamCoord } from '@/city/cityLayout'
import { cityConfig } from '@/config/cityConfig'
import { islandConfig, type IslandConfig } from '@/config/islandConfig'
import { rngFrom } from '@/utils/rng'
import { heightAt, shelfDistanceAt, type HeightField } from './heightField'
import { fbm2D, seedFor } from './noise'

/**
 * Where things grow, and what grows there.
 *
 * §16 asks for density that depends on the terrain and §14 for clusters rather
 * than an even scatter. Both come out of one number — a suitability field —
 * built from what the terrain already knows:
 *
 *   - a low-frequency CLUSTER mask, which is what makes forests and clearings
 *     instead of a uniform sprinkle
 *   - slope, because nothing holds on to a cliff
 *   - altitude, so growth thins toward a tree line and stops at the rock
 *   - WETNESS, taken straight from the drainage: ground with water running
 *     through it is the ground that grows things, so the forest thickens along
 *     the rivers on its own
 *   - the city's shelf, which is excluded outright
 *
 * Nothing is placed by hand and nothing is placed by distance from anything.
 */

/** The block grid's own bounds. Beyond these there are no blocks, only street. */
const GRID_MIN = seamCoord(-cityConfig.grid.midRadius - 1)
const GRID_MAX = seamCoord(cityConfig.grid.midRadius)

export type Species = 'palm' | 'broadleaf' | 'conifer'

export interface TreeInstance {
  x: number
  y: number
  z: number
  /** World-unit scale multiplier on the species' base size. */
  scale: number
  rotation: number
  species: Species
}

/**
 * Ground inside the city's plain that the forest may still have.
 *
 * Inside the grid the city does its own planting and the island must keep out.
 * But the grid is not the whole plain: the streets are drawn to a single reach
 * in both directions while the block spans either side of the tower are seeded
 * and do not come out symmetric, so on two sides they overhang the last block
 * by about two hundred and fifty units. That band had nothing on it at all —
 * no blocks for the city to plant and, until now, no island either — so from
 * above the wood stopped a clear margin short of the streets on those sides.
 *
 * It belongs to the forest: there is nothing else there. All it has to do is
 * keep off the tarmac that crosses it, which is what `nearSeam` answers — the
 * same question the road paint and the lamp posts ask, so the answers agree.
 */
function plantableInsideCity(x: number, z: number, c: IslandConfig): boolean {
  if (x > GRID_MIN && x < GRID_MAX && z > GRID_MIN && z < GRID_MAX) return false
  const clear = c.vegetation.roadClearance
  return !nearSeam(x, clear) && !nearSeam(z, clear)
}

/** Hermite ramp, 0 at `edge0`, 1 at `edge1`, clamped. */
function ramp(edge0: number, edge1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function cellOf(field: HeightField, x: number, z: number): number {
  const i = Math.min(field.size - 1, Math.max(0, Math.round((x + field.half) / field.step)))
  const j = Math.min(field.size - 1, Math.max(0, Math.round((z + field.half) / field.step)))
  return j * field.size + i
}

/** Local steepness, from the generation grid rather than the render mesh. */
export function slopeAt(field: HeightField, x: number, z: number): number {
  const s = field.step
  const l = heightAt(field, x - s, z)
  const r = heightAt(field, x + s, z)
  const d = heightAt(field, x, z - s)
  const u = heightAt(field, x, z + s)
  return Math.hypot((r - l) / (2 * s), (u - d) / (2 * s))
}

/**
 * How well vegetation does here, in [0, 1].
 *
 * Read by the tree placement AND by the terrain's own colouring, so the ground
 * goes forest-dark exactly where the trees are. Keeping one field behind both
 * is what stops a green patch appearing with no trees in it, or a stand of
 * trees on bare grass.
 */
export function vegetationAt(
  field: HeightField,
  x: number,
  z: number,
  c: IslandConfig = islandConfig,
): number {
  const cell = cellOf(field, x, z)
  const v = c.vegetation

  // How far outside the city's built plain this is. Negative means inside it.
  const outside = shelfDistanceAt(x, z, c)
  if (outside <= 0 && !plantableInsideCity(x, z, c)) return 0

  const h = heightAt(field, x, z)
  const above = h - c.world.seaLevel
  if (above <= v.shoreClearance) return 0

  // What the ground itself will bear, whatever else wants to grow here. Steep
  // ground sheds soil and above the tree line nothing holds at all.
  const gate =
    (1 - ramp(v.slopeEasy, v.slopeBare, slopeAt(field, x, z))) *
    (1 - ramp(v.treeLine, v.barrenLine, h))

  // Clusters. Two octaves is enough: this is the difference between forest and
  // clearing, not a texture.
  const cluster = fbm2D(x, z, seedFor(c.seed, 'forest'), v.cluster) * 0.5 + 0.5
  let d = ramp(v.clusterFloor, v.clusterFull, cluster) * gate

  // Wetter ground grows more. Straight off the drainage, so the woods follow
  // the rivers without anything knowing where the rivers are.
  const wet = Math.min(1, Math.sqrt(field.flow[cell]) / v.wetnessScale)
  d *= 1 + v.wetnessBonus * wet

  // The city's fringe: a wooded belt that closes the gap to the streets.
  //
  // The cluster mask decides where forest is and where clearing is, and it has
  // no idea a city is there — so it left the treeline two hundred units short
  // on one side, thirteen hundred on the diagonal, and on another side put no
  // trees within two thousand at all. That reads as a city standing in a bare
  // field, whatever the woods are doing further out.
  //
  // So within a band outside the plain the density has a FLOOR rather than a
  // mask: the belt is continuous on every side by construction. It is still
  // subject to `gate`, so the belt breaks for a cliff or a mountainside the
  // way it should, and beyond the band the natural clustered forest resumes.
  if (outside < v.fringeBand) {
    d = Math.max(d, v.fringeDensity * gate * (1 - ramp(v.fringeBand * 0.72, v.fringeBand, outside)))
  }

  return Math.max(0, Math.min(1, d))
}

/** Which species belongs at a point, given how high and how wet it is. */
export function speciesAt(
  field: HeightField,
  x: number,
  z: number,
  roll: number,
  c: IslandConfig = islandConfig,
): Species {
  const above = heightAt(field, x, z) - c.world.seaLevel
  // Palms hug the coast — §15 — and give out quickly inland.
  if (above < c.vegetation.palmBand) return roll < 0.82 ? 'palm' : 'broadleaf'
  if (above > c.vegetation.coniferBand) return roll < 0.75 ? 'conifer' : 'broadleaf'
  return roll < 0.78 ? 'broadleaf' : 'conifer'
}

/**
 * Seeded tree placement over a jittered grid.
 *
 * A jittered grid rather than pure random sampling: random points clump and
 * leave holes at exactly the scale a forest canopy is judged at, whereas a
 * jittered grid gives even coverage that the suitability field can then carve
 * clearings out of. The rejection test is what turns density into pattern.
 */
export function buildTrees(field: HeightField, target: number, c: IslandConfig = islandConfig): TreeInstance[] {
  const rng = rngFrom(`${c.seed}:trees`)
  const trees: TreeInstance[] = []

  // Grid pitch sized so the jittered grid can supply well over the target,
  // leaving the suitability test room to reject most of it.
  const span = field.half * 2
  const cells = Math.ceil(Math.sqrt(target * c.vegetation.oversample))
  const pitch = span / cells

  // Two passes, because `target` has to MEAN something. Accepting each sample
  // with probability equal to its own density made the count a consequence of
  // the density field rather than a budget: at a target of 26,000 it produced
  // 50,283, and adding the city's fringe belt would have pushed it further
  // without anything saying so. Summing the field first and scaling the
  // acceptance by target/expected keeps the relative distribution exactly —
  // the belt stays denser than the far woods in the same proportion — while
  // the total lands where it was asked to.
  const density = new Float32Array(cells * cells)
  let expected = 0
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = -field.half + (i + 0.5) * pitch
      const z = -field.half + (j + 0.5) * pitch
      const d = vegetationAt(field, x, z, c)
      density[j * cells + i] = d
      expected += d
    }
  }
  const scale = expected > 0 ? Math.min(1, target / expected) : 0

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = -field.half + (i + rng.next()) * pitch
      const z = -field.half + (j + rng.next()) * pitch
      const d = density[j * cells + i]
      if (d <= 0 || rng.next() > d * scale) continue

      const y = heightAt(field, x, z)
      const species = speciesAt(field, x, z, rng.next(), c)
      trees.push({
        x,
        y,
        z,
        // Size varies with how good the ground is: the best ground grows the
        // biggest trees, which is most of what makes a canopy read as one.
        scale: (0.62 + 0.75 * d) * rng.range(0.78, 1.28),
        rotation: rng.next() * Math.PI * 2,
        species,
      })
    }
  }
  return trees
}
