import * as THREE from 'three'
import { materialsConfig } from '@/config'
import { rngFrom } from '@/utils/rng'

/**
 * Procedural concrete for the hero's floor plates.
 *
 * One seeded tile, drawn on a canvas and repeated in world units — the same
 * idiom the city facades use, and dependency-free for the same reason. The
 * tile is deliberately near-neutral and very low contrast: the `slab`
 * material's own colour stays the source of the tone, and this only supplies
 * the fine break-up that stops a large flat plate reading as coloured paper.
 *
 * Two features, both of which real board-formed concrete has and neither of
 * which is legible as a "pattern" at tower distance: aggregate speckle, and
 * faint formwork board lines.
 */

/**
 * Returns null when there is no DOM.
 *
 * The shared materials are constructed by unit tests running under node, and a
 * material with a null map is exactly the material minus its map — which is
 * the right thing for a test that is checking roughness and reflectivity.
 */
export function heroConcreteTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  if (cache !== undefined) return cache

  const { textureSize: size, seed } = materialsConfig.heroConcrete
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    cache = null
    return cache
  }

  const rand = rngFrom(seed)

  // White base: this multiplies the material colour, so anything other than
  // white here would tint every plate a second time.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  // Aggregate. Kept within a few percent of white — at the scale a plate is
  // seen, stronger speckle stops looking like concrete and starts looking
  // like noise.
  for (let i = 0; i < size * 26; i++) {
    const x = rand.range(0, size)
    const y = rand.range(0, size)
    const r = rand.range(0.4, 1.5)
    const tone = rand.range(0.9, 1.0)
    ctx.fillStyle = `rgba(${tone * 255 | 0},${tone * 252 | 0},${tone * 246 | 0},${rand.range(0.05, 0.22)})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Formwork board lines, one band per notional board width. Drawn across the
  // full tile so the repeat is seamless in that axis.
  const boards = 4
  for (let i = 1; i < boards; i++) {
    const y = (i / boards) * size
    ctx.fillStyle = 'rgba(0,0,0,0.045)'
    ctx.fillRect(0, y, size, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.fillRect(0, y + 1, size, 1)
  }

  // A very soft blotch pass: real pours are never uniform across a bay.
  for (let i = 0; i < 18; i++) {
    const x = rand.range(0, size)
    const y = rand.range(0, size)
    const r = rand.range(size * 0.08, size * 0.26)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const dark = rand.chance(0.5)
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.035)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  // UVs are emitted in tile counts from world dimensions, so wrapping is what
  // actually tiles the plate and texel density stays constant regardless of
  // how wide the footprint is.
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cache = tex
  return cache
}

let cache: THREE.CanvasTexture | null | undefined

export function disposeHeroConcreteTexture(): void {
  cache?.dispose()
  cache = undefined
}
