import { rngFrom } from '@/utils/rng'

/**
 * A seeded field of clouds, as one merged mesh.
 *
 * Each cloud is a handful of soft billboards clustered together — overlapping
 * blobs read as a cloud where a single quad reads as a decal. All of them go
 * into ONE buffer with the billboarding done per-vertex in the shader, so the
 * whole sky costs a single draw call rather than one per puff.
 *
 * `positions` holds each puff's CENTRE, repeated once per vertex; the corner
 * offsets ride alongside and are turned into a screen-facing quad by the vertex
 * shader. That is why the mesh must not be frustum-culled: its bounding box is
 * the set of centres, which says nothing about where the quads actually land.
 */

export interface CloudField {
  /** Quads, two triangles each. */
  quads: number
  /** Puff centre, repeated per vertex. */
  positions: Float32Array
  /** Corner in [-1, 1]², doubling as the texture coordinate. */
  corners: Float32Array
  /** Half-width of the billboard, in world units. */
  scales: Float32Array
  opacities: Float32Array
  /** Per-cloud speed multiplier, so the field does not move as a slab. */
  drifts: Float32Array
}

/**
 * Where the clouds live.
 *
 * Moved out and scaled up by the same factor when the island arrived. Placement
 * is by ELEVATION ANGLE and size scales with distance, so the angular picture
 * from the opening camera is unchanged — but at the old radius the clouds sat
 * at island altitude and rested on the hills like fog banks.
 *
 * Far out and low, which is not where clouds are but is where they are VISIBLE.
 * The opening camera looks about eighteen degrees downward, so only the first
 * twenty degrees above the horizon are on screen — the same band that decided
 * the moon's height. A cloud at a realistic altitude directly overhead is
 * simply not in the picture. At this distance the ratio of altitude to
 * distance puts them a few degrees up, which is where the sky actually is.
 *
 * Being this far out also means they never come near the tower, so no
 * exclusion zone is needed around it.
 */
const RING_INNER = 5600
const RING_OUTER = 11200

/**
 * Placed by ELEVATION, with altitude derived from it — not by picking a height
 * and hoping.
 *
 * The visible band is narrow and the two ranges interact: an altitude that
 * reads well at the near edge of the ring is below the rooftops at the far
 * edge. Choosing the angle and solving for height puts every cloud in the band
 * regardless of how far out it lands. Below about eleven degrees they are
 * behind the skyline; above about twenty they are off the top of the frame.
 */
const ELEVATION_LOW = 11
const ELEVATION_HIGH = 20

/**
 * Twenty-two, not ten.
 *
 * Ten clouds spread over a full circle put about one and a half inside the
 * camera's fifty-degree view — the sky read as empty with a smudge at each
 * edge. The count is for COVERAGE, not density: the viewer can orbit, so they
 * have to be everywhere, and only a fraction is ever on screen.
 */
const CLOUDS = 22
const PUFFS_MIN = 4
const PUFFS_MAX = 6

export function buildCloudField(): CloudField {
  const rng = rngFrom('cloud-field-01')
  const centres: number[] = []
  const corners: number[] = []
  const scales: number[] = []
  const opacities: number[] = []
  const drifts: number[] = []

  // Corner offsets for two triangles, in [-1, 1]².
  const QUAD: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ]

  for (let cloud = 0; cloud < CLOUDS; cloud++) {
    const angle = rng.next() * Math.PI * 2
    const distance = rng.range(RING_INNER, RING_OUTER)
    const elevation = rng.range(ELEVATION_LOW, ELEVATION_HIGH)
    const altitude = distance * Math.tan((elevation * Math.PI) / 180)
    const cx = Math.cos(angle) * distance
    const cz = Math.sin(angle) * distance

    // One drift speed per CLOUD, not per puff — a cluster whose blobs each
    // moved at their own rate would pull itself apart as it crossed the sky.
    const drift = rng.range(0.6, 1.4)
    const baseScale = rng.range(630, 1470)
    const baseOpacity = rng.range(0.35, 0.8)
    const puffs = rng.int(PUFFS_MIN, PUFFS_MAX)

    for (let puff = 0; puff < puffs; puff++) {
      // Offsets are wide and flat: clouds spread sideways far more than they
      // stack, and a spherical cluster reads as a ball of smoke.
      const ox = rng.range(-1.1, 1.1) * baseScale
      const oy = rng.range(-0.25, 0.25) * baseScale
      const oz = rng.range(-0.5, 0.5) * baseScale
      const scale = baseScale * rng.range(0.55, 1)
      const opacity = baseOpacity * rng.range(0.7, 1)

      for (const [qx, qy] of QUAD) {
        centres.push(cx + ox, altitude + oy, cz + oz)
        corners.push(qx, qy)
        scales.push(scale)
        opacities.push(opacity)
        drifts.push(drift)
      }
    }
  }

  return {
    quads: centres.length / 3 / 6,
    positions: new Float32Array(centres),
    corners: new Float32Array(corners),
    scales: new Float32Array(scales),
    opacities: new Float32Array(opacities),
    drifts: new Float32Array(drifts),
  }
}

/** How far a cloud travels before it wraps back to the far side of the field. */
export const CLOUD_FIELD_HALF = RING_OUTER
