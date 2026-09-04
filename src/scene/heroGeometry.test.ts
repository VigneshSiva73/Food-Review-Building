import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildingConfig, slabOverhang } from '@/config'
import { footprintCorners } from '@/building'
import { triangleCount } from './geometryStats'
import {
  crownGeometry,
  crownMullionGeometry,
  crownProfile,
  crownRibGeometry,
  crownRibPart,
  helipadGeometry,
  pillarGeometry,
} from './resources'

const geom = pillarGeometry()
const pos = geom.getAttribute('position')

describe('column cylinder', () => {
  it('stands on y = 0 and is exactly one unit tall', () => {
    // The construction animator grows pillars by Y-scaling this geometry from
    // its origin, so a section that is not seated on zero would sink or float
    // every column in the tower for the whole intro.
    geom.computeBoundingBox()
    const b = geom.boundingBox!
    expect(Math.abs(b.min.y)).toBeLessThan(1e-6)
    expect(b.max.y).toBeCloseTo(1)
  })

  it('fits the unit cross-section it is scaled by', () => {
    // The instance transform multiplies this by `pillarWidth`. A section
    // wider than one unit would silently make every column fatter than the
    // configured width, and `plateEdgeRadius` — which has to clear exactly
    // this reach — would then be wrong.
    // Measured as a radius, not a bounding box: a polygon inscribed in the
    // unit circle touches it only at its vertices, so an even-segmented
    // section reaches 0.5 on one axis and less on the other.
    let reach = 0
    for (let i = 0; i < pos.count; i++) {
      reach = Math.max(reach, Math.hypot(pos.getX(i), pos.getZ(i)))
    }
    expect(reach).toBeCloseTo(0.5, 6)
    geom.computeBoundingBox()
    const b = geom.boundingBox!
    for (const v of [b.min.x, b.min.z]) expect(v).toBeGreaterThanOrEqual(-0.5 - 1e-6)
    for (const v of [b.max.x, b.max.z]) expect(v).toBeLessThanOrEqual(0.5 + 1e-6)
  })

  it('is round, not a prism with faces', () => {
    // The whole point of the shape. Every point on the wall must sit at the
    // same distance from the axis; a chamfered box would still pass the two
    // bounds tests above while looking nothing like a column.
    let offAxis = 0
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      if (r < 1e-6) continue // the cap centres sit on the axis
      expect(r).toBeCloseTo(0.5, 6)
      offAxis++
    }
    expect(offAxis).toBeGreaterThan(buildingConfig.pillarSegments)
  })

  it('has no arris anywhere, so no corner can catch the light', () => {
    // A square section puts four vertical highlights on every column. A
    // cylinder has none: the wall normals sweep continuously round the axis.
    const angles = new Set<string>()
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      if (r < 1e-6) continue
      angles.add(Math.atan2(pos.getZ(i), pos.getX(i)).toFixed(4))
    }
    expect(angles.size).toBeGreaterThanOrEqual(buildingConfig.pillarSegments)
  })

  it('stays cheap enough to instance for every meal of every day', () => {
    expect(triangleCount(geom)).toBeLessThan(120)
  })

  it('is cached, so the whole tower shares one buffer', () => {
    expect(pillarGeometry()).toBe(geom)
  })
})

describe('triangleCount', () => {
  it('reads the index when there is one, and positions when there is not', () => {
    // The helper exists because getting this wrong is silent: an indexed box
    // reports 12 triangles from its index and 8 from its vertex count.
    const indexed = new THREE.BoxGeometry(1, 1, 1)
    expect(indexed.index).not.toBeNull()
    expect(triangleCount(indexed)).toBe(12)
    expect(triangleCount(indexed.toNonIndexed())).toBe(12)
  })
})

describe('helipad marking', () => {
  const geom = helipadGeometry()

  it('fits inside the plate it is painted on', () => {
    // The marking is authored at world size, so nothing scales it down to fit.
    // The binding dimension is the footprint's INRADIUS — the distance from
    // the centre to the nearest edge — not the distance to a corner, which on
    // a triangle is twice as far and would wave a marking through the parapet.
    const corners = footprintCorners()
    const centre = corners.reduce(
      (acc, p) => ({ x: acc.x + p.x / 3, z: acc.z + p.z / 3 }),
      { x: 0, z: 0 },
    )
    let inradius = Infinity
    for (let i = 0; i < 3; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % 3]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      // Perpendicular distance from the centre to the edge line.
      inradius = Math.min(inradius, Math.abs(dz * (centre.x - a.x) - dx * (centre.z - a.z)) / len)
    }

    geom.computeBoundingBox()
    const b = geom.boundingBox!
    const reach = Math.max(Math.abs(b.min.x), b.max.x, Math.abs(b.min.z), b.max.z)
    expect(reach).toBeCloseTo(buildingConfig.helipad.radius, 6)
    expect(reach).toBeLessThan(inradius * 0.75)
  })

  it('stands proud of the plate rather than lying in it', () => {
    // Two coplanar faces are z-fighting, and this one would flicker across the
    // whole roof. The lift has to clear half the marks' own thickness.
    const { lift, markThickness } = buildingConfig.helipad
    expect(lift).toBeGreaterThan(markThickness / 2)
    geom.computeBoundingBox()
    expect(lift + geom.boundingBox!.min.y).toBeGreaterThan(0)
  })

  it('is one buffer, so the roof costs a single draw call', () => {
    expect(helipadGeometry()).toBe(geom)
    expect(triangleCount(geom)).toBeLessThan(200)
  })
})

describe('rooftop spire', () => {
  const geom = crownGeometry()
  const pos = geom.getAttribute('position')
  const at = (i: number) => ({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) })
  const height = buildingConfig.crown.height

  const plan = footprintCorners()
  const planCentre = {
    x: plan.reduce((t, p) => t + p.x, 0) / 3,
    z: plan.reduce((t, p) => t + p.z, 0) / 3,
  }
  const feet = plan.map((p) => ({ x: p.x - planCentre.x, z: p.z - planCentre.z }))
  const base = [
    ...new Set(
      [...Array(pos.count).keys()]
        .filter((i) => at(i).y === 0)
        .map((i) => `${at(i).x.toFixed(4)}:${at(i).z.toFixed(4)}`),
    ),
  ].map((k) => {
    const [x, z] = k.split(':').map(Number)
    return { x, z }
  })

  it('glazes the three elevations and leaves the corners open', () => {
    // Six vertices on the plate: two ends for each of three runs. The corners
    // are deliberately unglazed — that is how the facade below keeps its three
    // columns visible, and it is also the only reason the ribs and the glass
    // never meet.
    expect(base).toHaveLength(6)
  })

  it('finishes in a dome, not in a pin', () => {
    const rings = crownProfile()
    expect(rings[0]).toEqual({ y: 0, scale: 1 })
    expect(rings[rings.length - 1].scale).toBeCloseTo(0, 9)
    // A fillet takes the top DOWN: `height` is the apex the straight faces are
    // aimed at, not a height the geometry ever reaches.
    const top = rings[rings.length - 1].y
    expect(top).toBeLessThan(height)
    expect(top).toBeGreaterThan(height - 2 * buildingConfig.crown.tipRadius)

    // Monotonic all the way up — a radius too big for the spire would fold the
    // silhouette back on itself, and the fallback exists to avoid exactly that.
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].y).toBeGreaterThan(rings[i - 1].y)
      expect(rings[i].scale).toBeLessThan(rings[i - 1].scale)
    }
  })

  it('runs the faces dead straight, then curves into the cap without a crease', () => {
    const rings = crownProfile()
    // The straight run is exactly the line to the apex.
    expect(rings[1].scale).toBeCloseTo(1 - rings[1].y / height, 6)

    const slope = (i: number) =>
      (rings[i + 1].scale - rings[i].scale) / (rings[i + 1].y - rings[i].y)
    // Tangent, not chamfered: the first step of the fillet leaves the straight
    // side at very nearly the straight side's own slope, and every step after
    // it turns further. A chamfer would jump here.
    // A fifth, because what is compared is the fillet's first CHORD against
    // the true tangent; a chamfer here would be off by a factor, not a fifth.
    expect(Math.abs(slope(1) / slope(0) - 1)).toBeLessThan(0.2)
    for (let i = 2; i < rings.length - 2; i++) {
      expect(slope(i)).toBeLessThan(slope(i - 1))
    }
  })

  it('follows the plate outline, so the arrises land on the slab', () => {
    // The plate wraps each column on an arc of `slabOverhang` about its
    // centreline. Two flush faces meeting in a sharp corner would land at
    // TWICE that from the centreline — outside the plate — and the arris would
    // hang over thin air, which is exactly what it did before.
    for (const p of base) {
      const nearest = Math.min(...feet.map((f) => Math.hypot(p.x - f.x, p.z - f.z)))
      expect(nearest).toBeLessThanOrEqual(slabOverhang() + 1e-3)
    }
  })

  it('sits centred on the origin, so placing it at the roof centre is enough', () => {
    // The plan's own corners are NOT centred — the footprint is balanced on
    // its extent, so its centroid sits about 42 off z=0. Carrying that offset
    // in the geometry as well as in the mesh position would shift the spire
    // off the building, which is exactly what it once did.
    const cx = base.reduce((t, p) => t + p.x, 0) / base.length
    const cz = base.reduce((t, p) => t + p.z, 0) / base.length
    expect(Math.hypot(cx, cz)).toBeLessThan(1)
  })

  it('faces outward on every side', () => {
    // Backface culling makes an inverted spire invisible from outside, and the
    // footprint's handedness is the solver's business, not this file's.
    const normal = geom.getAttribute('normal')
    for (let i = 0; i < pos.count; i += 3) {
      const mid = { x: (at(i).x + at(i + 1).x) / 2, z: (at(i).z + at(i + 1).z) / 2 }
      const outward = normal.getX(i) * mid.x + normal.getZ(i) * mid.z
      expect(`face${i / 3}:${outward > 0}`).toBe(`face${i / 3}:true`)
    }
  })

  it('fills the open corner exactly, at every height', () => {
    // The rib and the glazing ride the same profile, so at any height the
    // rib's section IS the arc the glass leaves open there. Anything else
    // gapped low down or broke out through the glass higher up, which is what
    // a parallel shaft did.
    const ribs = crownRibGeometry().getAttribute('position')
    const rings = crownProfile()
    const scaleAt = (y: number) => {
      const ring = rings.find((r) => Math.abs(r.y - y) < 1e-3)
      expect(ring).toBeDefined()
      return ring!.scale
    }
    for (let i = 0; i < ribs.count; i++) {
      const shrink = scaleAt(ribs.getY(i))
      // Distance from this vertex to the nearest column centreline, at the
      // height it sits at — the axes converge on the apex too.
      const reach = Math.min(
        ...feet.map((f) =>
          Math.hypot(ribs.getX(i) - f.x * shrink, ribs.getZ(i) - f.z * shrink),
        ),
      )
      expect(reach).toBeCloseTo(slabOverhang() * shrink, 2)
    }
  })

  it('carries the facade\'s own mullion spacing up the glass', () => {
    // The tower is read by its fins. A crown of plain sheet glass on top of a
    // finned facade reads as a different material bolted on.
    const fins = crownMullionGeometry().getAttribute('position')
    expect(fins.count).toBeGreaterThan(0)
    let top = 0
    for (let i = 0; i < fins.count; i++) top = Math.max(top, fins.getY(i))
    // They run the full straight rise and stop where the cap begins. Carrying
    // them into the fillet would leave them standing off a curved surface.
    // Within a fin's own section, since a box astride the ring overshoots it
    // by half its thickness.
    expect(Math.abs(top - crownProfile()[1].y)).toBeLessThan(buildingConfig.mullionDepth)
  })

  it('tags each rib with the meal it carries', () => {
    // Which rib a ray hit is read off the merged buffer rather than by
    // splitting the spire into three meshes. If the tag drifts out of the
    // solver's corner order the tooltip names the wrong meal — which looks
    // entirely plausible and is wrong every time.
    const ribs = crownRibGeometry()
    const corner = ribs.getAttribute('corner')
    expect(corner).toBeDefined()
    expect(corner.count).toBe(ribs.getAttribute('position').count)
    expect(new Set([...Array(corner.count).keys()].map((i) => corner.getX(i)))).toEqual(
      new Set([0, 1, 2]),
    )
    // Every vertex of a face agrees, or `faceIndex * 3` reads a seam.
    for (let i = 0; i < corner.count; i += 3) {
      expect(corner.getX(i)).toBe(corner.getX(i + 1))
      expect(corner.getX(i)).toBe(corner.getX(i + 2))
    }
  })

  it('keeps each rib separately, for lighting one meal on its own', () => {
    const merged = crownRibGeometry().getAttribute('position').count
    const parts = [0, 1, 2].reduce(
      (t, c) => t + crownRibPart(c as 0 | 1 | 2).getAttribute('position').count,
      0,
    )
    expect(parts).toBe(merged)
  })

  it('is cached, so the crown costs one geometry per layer however often it remounts', () => {
    expect(crownGeometry()).toBe(geom)
    expect(crownRibGeometry()).toBe(crownRibGeometry())
    expect(crownMullionGeometry()).toBe(crownMullionGeometry())
  })
})
