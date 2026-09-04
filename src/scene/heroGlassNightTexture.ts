import * as THREE from 'three'
import { GLASS_TILE_FLOORS } from '@/building/facade'
import { rngFrom } from '@/utils/rng'

/**
 * The tower's windows after dark.
 *
 * The hero used to have no UVs on its glazing at all, so `glassGlow` lit every
 * pane on every floor to exactly the same value. Measured: the median, the 90th
 * percentile and the maximum of the whole facade were all 47.4 — one flat fill,
 * which is why it read as a solid brown slab rather than as a building.
 *
 * This is the same answer the city's facades use, for the same reason: an
 * emissive map whose dark texels emit nothing, so the wall between the windows
 * is lit by the sky and only the occupied rooms glow. It is authored per FLOOR
 * — one row of the map per storey — because a curtain wall that lights the same
 * panes on every level reads as a barcode, not as occupancy.
 *
 * Nothing here reaches the daytime render: the map is scaled by `glassGlow`,
 * which is exactly zero at both daylight keys.
 */

/** Window bays across one elevation. */
const COLS = 14
/** Pixels per bay. Enough for a frame and a reveal, not enough to be a photo. */
const CELL = 24

/**
 * The tone of the wall between the windows.
 *
 * Not black. Pure black between the windows took the tower from a flat slab
 * straight to a black rectangle — p50 0.0 — with the columns, the plate edges
 * and the curtain wall all invisible behind a scatter of lit panes. This is
 * the same reasoning as the city's facades: a building at night is dark, but
 * its architecture still has to be readable, so the wall carries a low cool
 * level that reads as glass under skyglow.
 *
 * Exported because the crown is glazed in the same glass but has no offices in
 * it, so it takes this tone flat, with no windows — see `applyHeroTimeOfDay`.
 */
export const GLASS_NIGHT_WALL = '#2f3843'

const WIDTH = COLS * CELL
const HEIGHT = GLASS_TILE_FLOORS * CELL

/**
 * Share of panes lit, per floor.
 *
 * Not one number: a real tower has floors that are almost entirely dark next to
 * floors where a team is still in. Rolling the occupancy per floor and then the
 * panes within it is what produces that, where a single global fraction gives
 * every storey the same faint scatter.
 *
 * Roughly doubled from the first pass, which averaged 0.24 and left four of
 * the sixteen storeys completely unlit — from across the city that read as a
 * tower with the power off rather than as one still working. The contrast is
 * what carries the look, not the darkness, so the quiet floors stay quiet
 * (0.06 and 0.10) and no floor is empty: a wholly dark storey in a stack this
 * short reads as a gap in the building.
 */
export const FLOOR_OCCUPANCY = [0.3, 0.62, 0.14, 0.78, 0.4, 0.06, 0.55, 0.86, 0.22, 0.48, 0.7, 0.1, 0.64, 0.34, 0.8, 0.26]

/**
 * Share of panes lit in the CROWN, per row.
 *
 * Under half what the offices below run at, and the gap is the whole point.
 * The spire is glazed but nobody works up there, so a scattering of lights
 * reads as service lighting left on; the floors' own occupancy applied to it
 * read as a storey of offices in a roof, which is the one thing at the top of
 * a building that cannot be there.
 *
 * Not much sparser than this, either. At a mean near 0.1 the crown showed one
 * lit pane per elevation, which reads as a fault rather than as a pattern —
 * the spire is only three or four map rows tall, so its occupancy has fewer
 * panes to express itself over than a whole facade does.
 */
export const CROWN_OCCUPANCY = [0.26, 0.1, 0.34, 0.16, 0.28, 0.05, 0.2, 0.36, 0.12, 0.3, 0.08, 0.22]

function draw(occupancy: readonly number[], seed: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')!
  const rand = rngFrom(seed)

  ctx.fillStyle = GLASS_NIGHT_WALL
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // No spandrel band. There was one — a near-black stripe at each floor line,
  // put there to give the tower a horizontal rhythm after dark. On the
  // building it read as a black mark sitting on top of every slab, which is a
  // worse fault than the flatness it was fixing: the tower already has all the
  // horizontal rhythm it needs from the plates themselves, and they are lit.
  // Do not put it back without looking at a night render first.

  for (let row = 0; row < GLASS_TILE_FLOORS; row++) {
    const lit = occupancy[row % occupancy.length]
    // A floor's lights share a colour temperature — one office, one ceiling
    // spec. Mixing warm and cool WITHIN a storey is what makes a facade read as
    // random noise rather than as rooms.
    const warm = rand.chance(0.76)
    for (let col = 0; col < COLS; col++) {
      if (!rand.chance(lit)) continue

      // Inset from the cell, leaving the mullion and the spandrel dark. A pane
      // that fills its cell edge-to-edge is a glowing brick.
      const x = col * CELL + CELL * 0.14
      const y = row * CELL + CELL * 0.22
      const w = CELL * 0.72
      const h = CELL * 0.5

      ctx.fillStyle = warm ? '#ffdcae' : '#d8e6ff'
      ctx.globalAlpha = rand.range(0.4, 0.85)
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1

      // Brightest where the ceiling is, falling off toward the sill — an
      // interior seen through glass, not a light box.
      const g = ctx.createLinearGradient(x, y, x, y + h)
      g.addColorStop(0, 'rgba(255,255,255,0.16)')
      g.addColorStop(0.5, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.34)')
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
    }
  }

  return canvas
}

let cache: THREE.CanvasTexture | null = null
let crownCache: THREE.CanvasTexture | null = null

function asTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas)
  // `u` is normalised per elevation and `v` per floor, so both stay inside
  // the tile. Clamping rather than repeating means a corner return samples
  // the near edge instead of folding the far one back over it.
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * Returns null when there is no DOM.
 *
 * The shared materials are constructed by unit tests running under node, the
 * same reason `heroConcreteTexture` guards. A material with a null emissive map
 * is exactly the material minus its windows, which is the right thing for a
 * test checking glow levels rather than pixels.
 */
export function heroGlassNightTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  cache ??= asTexture(draw(FLOOR_OCCUPANCY, 'hero-glass-night-01'))
  return cache
}

/**
 * The same windows, drawn far sparser, for the spire.
 *
 * Its own map rather than a dimmer copy of the floors': what makes the crown
 * read as a crown is that FEW of its panes are lit, not that all of them are
 * lit faintly. A dimmer whole map lifts the wall between the windows by just
 * as much and the spire goes back to being an evenly glowing lid.
 *
 * Same wall tone, same warm-and-cool pair, same per-row temperature — so the
 * lights that are on up there are the building's own lights, seen higher up.
 */
export function heroCrownNightTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  crownCache ??= asTexture(draw(CROWN_OCCUPANCY, 'hero-crown-night-01'))
  return crownCache
}

export function disposeHeroGlassNightTexture(): void {
  cache?.dispose()
  cache = null
  crownCache?.dispose()
  crownCache = null
}
