import * as THREE from 'three'
import { cityConfig } from '@/config'
import type { CityBuildingSpec, CityBuildingType, HouseSpec } from '@/city'

/**
 * Turn building specs into merged geometry (plan §§18–19, 34).
 *
 * Buildings are grouped by facade family and merged into one buffer each, so
 * the whole near ring costs a handful of draw calls. Instancing was the
 * obvious alternative and is wrong here: a shared box scaled per instance
 * stretches its UVs, which would make window size vary with building size.
 * Merging lets each wall carry UVs measured in world units instead, so a
 * window is the same size everywhere.
 *
 * Per-building tint rides on vertex colours rather than separate materials,
 * which keeps a whole family on one draw call.
 */

export type FacadeFamily = 'office' | 'residential' | 'masonry'

/** Which facade texture each building type wears. */
export const FAMILY_OF: Readonly<Record<CityBuildingType, FacadeFamily>> = Object.freeze({
  midOffice: 'office',
  glassTower: 'office',
  highRise: 'office',
  residential: 'residential',
  lowRise: 'masonry',
  oldUrban: 'masonry',
})

/**
 * Tints per type, multiplied into the facade texture.
 *
 * A palette each rather than one swatch. Three families of texture across six
 * types meant a street of six buildings wore three surfaces between them, and
 * the per-building shade lift only made some of them lighter versions of the
 * same thing. These are the materials the brief asks for — concrete, glass,
 * brick, stone, painted render — carried as colour over the shared textures,
 * which costs nothing: the family is still one draw call.
 */
const TINTS_OF: Readonly<Record<CityBuildingType, readonly string[]>> = Object.freeze({
  midOffice: ['#8d939c', '#7f8a91', '#9aa0a4', '#86887f'],
  glassTower: ['#79868f', '#6d8189', '#8494a0', '#5f7a86'],
  highRise: ['#949aa2', '#a1a29c', '#87909b', '#9d968d'],
  residential: ['#9b9188', '#a89a86', '#8f8b85', '#b0a394', '#87847e'],
  lowRise: ['#a3968a', '#b0a392', '#96958f', '#a9a396', '#8e8d88'],
  oldUrban: ['#8a7468', '#96705d', '#7d6a5e', '#a07a64', '#6f6157'],
})

export interface MergedBuildings {
  /** One merged facade buffer per family present in the input. */
  facades: Map<FacadeFamily, THREE.BufferGeometry>
  /** All roof slabs, in one buffer. */
  roofs: THREE.BufferGeometry
}

/** Tile size in world units, derived so windows keep a constant scale. */
export function facadeTileSize(): { width: number; height: number } {
  const f = cityConfig.facade
  return {
    width: f.paneWidth * f.tileCols,
    height: cityConfig.buildings.storeyHeight * f.tileRows,
  }
}

/**
 * Footprint corners, clockwise seen from above.
 *
 * The order is load-bearing: walking c0→c1→c2→c3 in this direction makes each
 * wall's cross product point away from the building, and makes the roof quad
 * face up. Reversing it turns every face inside out and the whole block
 * vanishes to back-face culling.
 */
function footprint(spec: CityBuildingSpec): [number, number][] {
  const hw = spec.width / 2
  const hd = spec.depth / 2
  const cos = Math.cos(spec.rotationY)
  const sin = Math.sin(spec.rotationY)
  const local: [number, number][] = [
    [-hw, -hd],
    [-hw, hd],
    [hw, hd],
    [hw, -hd],
  ]
  return local.map(([x, z]) => [
    spec.position.x + x * cos - z * sin,
    spec.position.z + x * sin + z * cos,
  ])
}

interface Sink {
  position: number[]
  uv: number[]
  color: number[]
}

type Corners = [number, number][]

/** Shrink a footprint toward its own centre. */
function inset(corners: Corners, factor: number): Corners {
  let cx = 0
  let cz = 0
  for (const [x, z] of corners) {
    cx += x / corners.length
    cz += z / corners.length
  }
  return corners.map(([x, z]) => [cx + (x - cx) * factor, cz + (z - cz) * factor]) as Corners
}

function pushTri(
  sink: Sink,
  verts: [number, number, number][],
  uvs: [number, number][],
  tint: THREE.Color,
) {
  for (let i = 0; i < 3; i++) {
    sink.position.push(verts[i][0], verts[i][1], verts[i][2])
    sink.uv.push(uvs[i][0], uvs[i][1])
    sink.color.push(tint.r, tint.g, tint.b)
  }
}

function toGeometry(sink: Sink): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(sink.position, 3))
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(sink.uv, 2))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(sink.color, 3))
  geom.computeVertexNormals()
  return geom
}

/** The four walls of a mass, from `y0` up to `y1`. */
function walls(
  sink: Sink,
  corners: Corners,
  y0: number,
  y1: number,
  tile: { width: number; height: number },
  tint: THREE.Color,
): void {
  // UVs are measured from the mass's own base rather than from the ground, so
  // a podium's windows line up with its own floors and not with the tower's.
  const v0 = y0 / tile.height
  const v1 = y1 / tile.height
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]
    const [bx, bz] = corners[(i + 1) % 4]
    const uEnd = Math.hypot(bx - ax, bz - az) / tile.width
    const a: [number, number, number] = [ax, y0, az]
    const b: [number, number, number] = [bx, y0, bz]
    const c: [number, number, number] = [bx, y1, bz]
    const d: [number, number, number] = [ax, y1, az]
    pushTri(sink, [a, b, c], [[0, v0], [uEnd, v0], [uEnd, v1]], tint)
    pushTri(sink, [a, c, d], [[0, v0], [uEnd, v1], [0, v1]], tint)
  }
}

/** A horizontal deck closing the top of a mass. */
function cap(sink: Sink, corners: Corners, y: number, tint: THREE.Color): void {
  const r = corners.map(([x, z]) => [x, y, z] as [number, number, number])
  pushTri(sink, [r[0], r[1], r[2]], [[0, 0], [1, 0], [1, 1]], tint)
  pushTri(sink, [r[0], r[2], r[3]], [[0, 0], [1, 1], [0, 1]], tint)
}

/**
 * House colours. Painted render, brick and stone, which is what a suburb is.
 *
 * Their own palette rather than a share of `oldUrban`'s: a street of houses is
 * more varied in colour than a block of offices, because each one was painted
 * by somebody different.
 */
const HOUSE_TINTS: readonly string[] = [
  '#b8ada0', '#a89b8c', '#c2b8a6', '#9d968d', '#b0a08e',
  '#8f8a82', '#c7bcae', '#a6907c', '#bdb5ab', '#95917f',
]

const ROOF_TINTS: readonly string[] = ['#5a4f4a', '#6b5c52', '#4e4a49', '#7a685c', '#57534e']

/**
 * Houses, into the same buffers as everything else.
 *
 * Walls join the masonry family and roofs the roof buffer, so two thousand
 * houses cost no draw calls at all — the alternative was two more meshes, and
 * the environment is already at 26 of its 28.
 */
function pushHouses(
  houses: HouseSpec[],
  sinks: Map<FacadeFamily, Sink>,
  roofSink: Sink,
  tile: { width: number; height: number },
): void {
  if (houses.length === 0) return
  let sink = sinks.get('masonry')
  if (!sink) {
    sink = { position: [], uv: [], color: [] }
    sinks.set('masonry', sink)
  }

  for (const house of houses) {
    const wall = new THREE.Color(
      HOUSE_TINTS[Math.min(HOUSE_TINTS.length - 1, Math.floor(house.variant * HOUSE_TINTS.length))],
    )
    const roll = (house.variant * 17.3) % 1
    const roof = new THREE.Color(
      ROOF_TINTS[Math.min(ROOF_TINTS.length - 1, Math.floor(roll * ROOF_TINTS.length))],
    )

    const hw = house.width / 2
    const hd = house.depth / 2
    const cos = Math.cos(house.rotationY)
    const sin = Math.sin(house.rotationY)
    /** Local (x, z) to world, about the house's own centre. */
    const world = (x: number, z: number): [number, number] => [
      house.position.x + x * cos - z * sin,
      house.position.z + x * sin + z * cos,
    ]

    const plan: Corners = [world(-hw, -hd), world(-hw, hd), world(hw, hd), world(hw, -hd)]
    const eaves = house.height
    walls(sink, plan, 0, eaves, tile, wall)

    if (house.ridge <= 0) {
      cap(roofSink, plan, eaves, roof)
      continue
    }

    // A gable, with the ridge running along the frontage. Two slopes and two
    // triangular ends: six triangles, which is what a house's silhouette is
    // worth and what tells it from a small office at any distance.
    const peak = eaves + house.ridge
    const [rax, raz] = world(-hw, 0)
    const [rbx, rbz] = world(hw, 0)
    const ridgeA: [number, number, number] = [rax, peak, raz]
    const ridgeB: [number, number, number] = [rbx, peak, rbz]
    const corner = (i: number): [number, number, number] => [plan[i][0], eaves, plan[i][1]]
    const c0 = corner(0)
    const c1 = corner(1)
    const c2 = corner(2)
    const c3 = corner(3)

    // Slope over the back (local +z) and the front (local -z).
    pushTri(roofSink, [c1, c2, ridgeB], [[0, 0], [1, 0], [1, 1]], roof)
    pushTri(roofSink, [c1, ridgeB, ridgeA], [[0, 0], [1, 1], [0, 1]], roof)
    pushTri(roofSink, [c3, c0, ridgeA], [[0, 0], [1, 0], [1, 1]], roof)
    pushTri(roofSink, [c3, ridgeA, ridgeB], [[0, 0], [1, 1], [0, 1]], roof)
    // The two gable ends, in wall colour because that is what they are.
    pushTri(sink, [c0, c1, ridgeA], [[0, 0], [1, 0], [0.5, 1]], wall)
    pushTri(sink, [c2, c3, ridgeB], [[0, 0], [1, 0], [0.5, 1]], wall)
  }
}

export function buildBuildingGeometry(
  specs: CityBuildingSpec[],
  houses: HouseSpec[] = [],
): MergedBuildings {
  const tile = facadeTileSize()
  const sinks = new Map<FacadeFamily, Sink>()
  const roofSink: Sink = { position: [], uv: [], color: [] }
  const tintCache = new Map<string, THREE.Color>()

  for (const spec of specs) {
    const family = FAMILY_OF[spec.type]
    let sink = sinks.get(family)
    if (!sink) {
      sink = { position: [], uv: [], color: [] }
      sinks.set(family, sink)
    }

    // One `variant` has to answer several independent questions — swatch,
    // podium, how many storeys of step — and using it raw for all of them
    // correlates them: every pale building would also be the one without a
    // podium. Multiplying by a different constant and keeping the fraction
    // decorrelates them and stays deterministic.
    const roll = (k: number) => (spec.variant * k) % 1
    const pickIn = (r: number, min: number, max: number) => min + Math.floor(r * (max - min + 1))

    const palette = TINTS_OF[spec.type]
    const swatch = palette[Math.min(palette.length - 1, Math.floor(roll(7.13) * palette.length))]
    let tint = tintCache.get(swatch)
    if (!tint) {
      tint = new THREE.Color(swatch)
      tintCache.set(swatch, tint)
    }
    const shaded = tint.clone().multiplyScalar(0.86 + spec.variant * 0.28)
    const roofTint = shaded.clone().multiplyScalar(0.72)

    const b = cityConfig.buildings
    const storey = b.storeyHeight
    const plan = footprint(spec)
    const h = spec.height

    // Tower on a podium, for the tall commercial stock. The podium keeps the
    // parcel's own footprint and the tower steps in out of it.
    const podium =
      spec.floors >= b.podium.minFloors && roll(13.7) < b.podium.chance
        ? pickIn(roll(29.3), b.podium.storeys.min, b.podium.storeys.max)
        : 0
    const corners = podium > 0 ? inset(plan, 1 - b.podium.towerInset) : plan

    if (podium > 0) {
      const py = podium * storey
      walls(sink, plan, 0, py, tile, shaded)
      cap(roofSink, plan, py, roofTint)
      walls(sink, corners, py, h, tile, shaded)
    } else {
      walls(sink, corners, 0, h, tile, shaded)
    }

    // The top. `RoofType` finally does something.
    cap(roofSink, corners, h, roofTint)
    if (spec.roof === 'parapet') {
      // Upstand around the deck: seen from outside it closes the elevation,
      // seen from above the deck still reads as a roof rather than a lid.
      walls(sink, corners, h, h + b.roof.parapetHeight, tile, roofTint)
    } else if (spec.roof === 'stepped') {
      const top = inset(corners, 1 - b.roof.stepInset)
      const y = h + pickIn(roll(41.9), b.roof.stepStoreys.min, b.roof.stepStoreys.max) * storey
      walls(sink, top, h, y, tile, shaded)
      cap(roofSink, top, y, roofTint)
    } else if (spec.roof === 'mechanical') {
      const plant = inset(corners, b.roof.plantFraction)
      const y = h + pickIn(roll(57.1), b.roof.plantStoreys.min, b.roof.plantStoreys.max) * storey
      walls(sink, plant, h, y, tile, roofTint)
      cap(roofSink, plant, y, roofTint)
    }
  }

  pushHouses(houses, sinks, roofSink, tile)

  const facades = new Map<FacadeFamily, THREE.BufferGeometry>()
  for (const [family, sink] of sinks) facades.set(family, toGeometry(sink))

  return { facades, roofs: toGeometry(roofSink) }
}
