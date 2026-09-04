import * as THREE from 'three'
import { cityConfig } from '@/config'
import { rngFrom } from '@/utils/rng'
import type { FacadeFamily } from './buildingGeometry'

/**
 * Procedural facade textures (plan §§11, 19, 44).
 *
 * One tile per facade family, drawn on a canvas and tiled by world-unit UVs.
 * Procedural rather than image assets: it keeps the app dependency-free and
 * offline, and it costs three 256px canvases instead of a texture download.
 *
 * Seeded, so the window pattern is identical on every refresh — the same
 * determinism rule the rest of the city follows.
 */

const { tileCols, tileRows, textureSize } = cityConfig.facade

interface Palette {
  wall: string
  glass: string
  glassAlt: string
  frame: string
  /** Fraction of the bay taken by glass, horizontally and vertically. */
  fill: [number, number]
}

const PALETTES: Readonly<Record<FacadeFamily, Palette>> = Object.freeze({
  // Curtain wall: wide glass, slim spandrel, strong vertical rhythm.
  office: {
    wall: '#6f747c',
    glass: '#2b333d',
    glassAlt: '#39434e',
    frame: '#878d95',
    fill: [0.82, 0.62],
  },
  // Punched openings with a deeper reveal and a balcony band.
  residential: {
    wall: '#8b8279',
    glass: '#333029',
    glassAlt: '#403c34',
    frame: '#9c948b',
    fill: [0.52, 0.5],
  },
  // Masonry: small windows, heavy wall, visible courses.
  masonry: {
    wall: '#7d6b5e',
    glass: '#2c2620',
    glassAlt: '#37302a',
    frame: '#8d7c6e',
    fill: [0.4, 0.46],
  },
})

/**
 * What the day tile is washed down to before the lit panes go on.
 *
 * Tuned by measurement, not by eye: the wall has to land near sRGB 40 in the
 * final render — dark enough to read as night, bright enough that a roof plane
 * is not literally 0. The blue in it is the cool half of the night's colour
 * contrast; the warmth all comes from the windows.
 */
const NIGHT_WASH = 'rgba(14,20,36,0.62)'

/**
 * Share of panes lit, per FLOOR.
 *
 * Not one number applied pane by pane, which is what the city used to do and
 * why it read as a bead curtain rather than as buildings: an even scatter at
 * one probability puts roughly the same handful of lights on every storey of
 * every block, and at district scale that is a texture, not a city.
 *
 * A real tower has floors that are almost entirely dark next to floors where a
 * team is still in. Rolling the occupancy per floor and then the panes within
 * it is what produces that — the same answer the hero's own glazing reached,
 * and the reason the two now read as the same kind of building after dark.
 */
const FLOOR_OCCUPANCY = [0, 0.42, 0.1, 0.58, 0, 0.24, 0.66, 0.06, 0.34, 0, 0.5, 0.16]

function drawTile(family: FacadeFamily): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')!
  const p = PALETTES[family]
  const rand = rngFrom(`${cityConfig.seed}:facade:${family}`)

  ctx.fillStyle = p.wall
  ctx.fillRect(0, 0, textureSize, textureSize)

  const bayW = textureSize / tileCols
  const bayH = textureSize / tileRows

  // Masonry gets horizontal courses so the wall is not a flat field.
  if (family === 'masonry') {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (let y = 0; y < textureSize; y += 6) ctx.fillRect(0, y, textureSize, 1)
  }

  for (let row = 0; row < tileRows; row++) {
    for (let col = 0; col < tileCols; col++) {
      const w = bayW * p.fill[0]
      const h = bayH * p.fill[1]
      const x = col * bayW + (bayW - w) / 2
      const y = row * bayH + (bayH - h) / 2

      // Frame first, glass inset into it — cheap way to get a reveal.
      ctx.fillStyle = p.frame
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2)
      ctx.fillStyle = rand.chance(0.5) ? p.glass : p.glassAlt
      ctx.fillRect(x, y, w, h)

      // A soft sky reflection down the top of each pane.
      const grad = ctx.createLinearGradient(x, y, x, y + h)
      grad.addColorStop(0, 'rgba(255,255,255,0.16)')
      grad.addColorStop(0.45, 'rgba(255,255,255,0.02)')
      grad.addColorStop(1, 'rgba(0,0,0,0.12)')
      ctx.fillStyle = grad
      ctx.fillRect(x, y, w, h)
    }

    if (family === 'residential') {
      // Balcony shadow band under each floor line.
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(0, (row + 1) * bayH - 3, textureSize, 3)
    }
  }

  // Vertical mullions, the strongest cue that a facade is a curtain wall.
  if (family === 'office') {
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    for (let col = 0; col <= tileCols; col++) ctx.fillRect(col * bayW - 1, 0, 2, textureSize)
  }

  return canvas
}

/**
 * The same wall after dark: the facade's own structure at a whisper, with the
 * lit panes on top.
 *
 * Drawn on the SAME bay grid as the albedo above, from the same tile size and
 * the same `tileCols`/`tileRows`, so a lit rectangle lands exactly on a window
 * rather than near one. Building UVs are world units divided by the tile size,
 * identical for every wall quad, which is what lets one emissive map line up
 * pane-for-pane with the diffuse across the whole district.
 *
 * The wall between the windows is NOT black, and that is the whole point.
 * A night rig can only put about 1/600th of daylight on a wall before it would
 * have to be brighter than the golden hour that precedes it, and ACES crushes
 * that to sRGB 3 — a black cutout with glowing dots on it. Measured: the
 * moonlit face and the shaded face of the same block came out identical, so the
 * architecture had no form at all.
 *
 * Real cities at night are not lit by the sky, they are lit by themselves. So
 * the wall carries a dimmed, cooled copy of its OWN daylight tile: mullions,
 * courses and balcony bands all survive at a level that reads as a surface
 * catching the glow of the city around it. A flat fill would have lifted the
 * wall off black just as well and thrown away every cue that tells an office
 * block from a masonry one.
 *
 * None of this leaks into the day. The whole map is scaled by `windowGlow`,
 * which is exactly zero at the daylight keys, so the daytime render cannot see
 * it however bright it is painted here.
 */
function drawNightTile(family: FacadeFamily): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = textureSize
  canvas.height = textureSize
  const ctx = canvas.getContext('2d')!
  const p = PALETTES[family]
  const rand = rngFrom(`${cityConfig.seed}:facade-night:${family}`)

  // The facade's own daylight tile, then a heavy cool wash over it. Multiplying
  // toward a blue-black rather than plain black is what keeps the ambient cool
  // and the lit windows warm — the contrast the whole night reads by.
  ctx.drawImage(drawTile(family), 0, 0)
  ctx.fillStyle = NIGHT_WASH
  ctx.fillRect(0, 0, textureSize, textureSize)

  const bayW = textureSize / tileCols
  const bayH = textureSize / tileRows

  for (let row = 0; row < tileRows; row++) {
    // Scaled by `litFraction` so the one knob still sets how awake the city is
    // overall, while the floor-to-floor variation carries the look.
    const occupancy =
      FLOOR_OCCUPANCY[row % FLOOR_OCCUPANCY.length] * (cityConfig.facade.litFraction / 0.26)
    // A floor's lights share a colour temperature — one office, one ceiling
    // spec. Rolling warm against cool WITHIN a storey is what made the city
    // read as cold static: at this size, alternating tones pane by pane is
    // indistinguishable from noise.
    const warm = rand.chance(0.78)

    for (let col = 0; col < tileCols; col++) {
      // Most windows are dark. A block where every pane is lit reads as a
      // showroom, not as a building people work in — and the ones that are lit
      // only register as lit because their neighbours are not.
      if (!rand.chance(occupancy)) continue

      const w = bayW * p.fill[0]
      const h = bayH * p.fill[1]
      const x = col * bayW + (bayW - w) / 2
      const y = row * bayH + (bayH - h) / 2

      // A lit pane is a room seen through glass, not a bulb. Cutting back to
      // the wall tone first stops the wash underneath tinting it green.
      ctx.fillStyle = '#000000'
      ctx.fillRect(x, y, w, h)

      // Two tones, warm and cool, in the proportion offices actually show:
      // mostly tungsten, occasionally something fluorescent. Both are pulled
      // well back from saturated amber — at this size a strong orange is what
      // reads as an LED rather than as a window.
      ctx.fillStyle = warm ? '#ffe0b8' : '#dfe9ff'
      ctx.globalAlpha = rand.range(0.55, 0.95)
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1

      // The glass is darker at its edges than at its centre, which is what
      // stops a lit pane reading as a flat bright rectangle.
      const g = ctx.createLinearGradient(x, y, x, y + h)
      g.addColorStop(0, 'rgba(0,0,0,0.30)')
      g.addColorStop(0.4, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.22)')
      ctx.fillStyle = g
      ctx.fillRect(x, y, w, h)
    }
  }

  return canvas
}

let cache: Map<FacadeFamily, THREE.CanvasTexture> | null = null
let nightCache: Map<FacadeFamily, THREE.CanvasTexture> | null = null

export function facadeTextures(): Map<FacadeFamily, THREE.CanvasTexture> {
  if (!cache) {
    cache = new Map()
    for (const family of ['office', 'residential', 'masonry'] as const) {
      const tex = new THREE.CanvasTexture(drawTile(family))
      // UVs are in tile counts, so wrapping is what tiles the wall.
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      cache.set(family, tex)
    }
  }
  return cache
}

/** The lit-window map, in the same tiling as {@link facadeTextures}. */
export function facadeNightTextures(): Map<FacadeFamily, THREE.CanvasTexture> {
  if (!nightCache) {
    nightCache = new Map()
    for (const family of ['office', 'residential', 'masonry'] as const) {
      const tex = new THREE.CanvasTexture(drawNightTile(family))
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      nightCache.set(family, tex)
    }
  }
  return nightCache
}

export function disposeFacadeTextures(): void {
  cache?.forEach((t) => t.dispose())
  cache = null
  nightCache?.forEach((t) => t.dispose())
  nightCache = null
}
