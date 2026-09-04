import { cityConfig, roadReserve, type CityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import { buildCityLayout, seamCoord } from './cityLayout'
import { builtBlocks } from './cityBuildings'
import { buildPlotSurfaces } from './parking'
import { buildFacilities, facilityAt } from './civic'
import { buildThemePark, isThemeParkBlock } from './themePark'
import { isHouseBlock } from './houses'
import type { BlockCoord } from './types'
import { zoneAt } from './zoning'

/**
 * What the ground is made of where nothing is built on it.
 *
 * The zoning reserves sixty-odd blocks as parkland and another sixty as land
 * nobody has developed, and every one of them was rendering as the same bare
 * brown shelf the streets stand on — so a park read as a car park with trees
 * in it. Grass is the cheapest possible fix and by far the largest: a couple
 * of hundred flat rectangles turn every empty block in the city green.
 *
 * Deliberately NOT one rectangle per block. A park whose edge runs dead
 * straight along all four streets is the thing the brief calls out — "do not
 * create perfectly square parks everywhere" — so each block is covered by
 * several overlapping patches with jittered edges, which gives a lawn with an
 * irregular boundary for the same handful of triangles.
 */

export type CoverKind = 'lawn' | 'meadow' | 'garden'

export interface GroundPatch {
  cx: number
  cz: number
  halfW: number
  halfD: number
  y: number
  kind: CoverKind
}

/** How the three surfaces read: mown, rough, and private garden. */
export const COVER_TINTS: Readonly<Record<CoverKind, string>> = Object.freeze({
  lawn: '#4c6b3c',
  meadow: '#6e7345',
  garden: '#4f6640',
})

export function buildGroundCover(c: CityConfig = cityConfig): GroundPatch[] {
  const g = c.groundCover
  const r = c.grid.midRadius
  const reserve = roadReserve(true, c)
  const out: GroundPatch[] = []

  const push = (block: BlockCoord, inset: number, kind: CoverKind) => {
    const minX = seamCoord(block.bx - 1, c) + reserve + inset
    const maxX = seamCoord(block.bx, c) - reserve - inset
    const minZ = seamCoord(block.bz - 1, c) + reserve + inset
    const maxZ = seamCoord(block.bz, c) - reserve - inset
    if (maxX - minX < 10 || maxZ - minZ < 10) return

    const rng = rngFrom(`${c.seed}:cover:${block.bx}:${block.bz}`)
    const w = maxX - minX
    const d = maxZ - minZ

    // A base patch covering most of the block, then a few overlapping ones
    // that push past its edges in places and fall short in others. The union
    // reads as a lawn with a wandering boundary rather than as a rectangle.
    out.push({
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      halfW: (w / 2) * rng.range(0.74, 0.9),
      halfD: (d / 2) * rng.range(0.74, 0.9),
      y: g.y,
      kind,
    })
    for (let i = 0; i < g.patches; i++) {
      const halfW = (w / 2) * rng.range(0.3, 0.62)
      const halfD = (d / 2) * rng.range(0.3, 0.62)
      out.push({
        cx: rng.range(minX + halfW, maxX - halfW),
        cz: rng.range(minZ + halfD, maxZ - halfD),
        halfW,
        halfD,
        y: g.y,
        kind,
      })
    }
  }

  // Landscaping around every building, in the margin of its own plot.
  for (const green of buildPlotSurfaces(buildCityLayout(c), c).greens) {
    out.push({ ...green, y: g.y, kind: 'garden' })
  }

  // The theme park is a lawn with a midway across it.
  const park = buildThemePark(c)
  if (park) {
    out.push({
      cx: park.bounds.cx,
      cz: park.bounds.cz,
      halfW: park.bounds.halfW,
      halfD: park.bounds.halfD,
      y: g.y,
      kind: 'lawn',
    })
  }

  // A facility's own grounds: playing fields, hospital landscaping. Emitted
  // here rather than by the facility, so all the grass in the city is one
  // buffer and one draw call.
  for (const f of buildFacilities(c)) {
    for (const patch of f.greens) {
      out.push({ ...patch, y: g.y, kind: f.kind === 'sports' ? 'lawn' : 'garden' })
    }
  }

  for (let bx = -r; bx <= r; bx++) {
    for (let bz = -r; bz <= r; bz++) {
      const block = { bx, bz }
      if (facilityAt(block, c) || isThemeParkBlock(block, c)) continue
      const zone = zoneAt(block, c)
      if (isHouseBlock(block, c)) {
        // Gardens only, well behind the building line, so no lawn is laid
        // across a front path or a driveway.
        push(block, g.gardenInset, 'garden')
      } else if (zone === 'park') {
        push(block, g.parkInset, 'lawn')
      } else if (zone === 'undeveloped' || !builtBlocks(c).has(`${bx}:${bz}`)) {
        // A block in a built zone whose parcels all came up empty is a vacant
        // lot, and a vacant lot is grass. Left as the bare shelf underneath,
        // it reads as unfinished rendering rather than as land nobody took.
        push(block, g.vacantInset, 'meadow')
      }
    }
  }
  return out
}
