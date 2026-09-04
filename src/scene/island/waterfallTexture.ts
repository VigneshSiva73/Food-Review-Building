import * as THREE from 'three'
import { rngFrom } from '@/utils/rng'

/**
 * A tileable sheet of falling water.
 *
 * Vertical streaks with soft ends, so scrolling it downward reads as water in
 * motion rather than as a moving pattern. Seeded, and wrapped in v only — the
 * sheet is one span wide and repeating it sideways would mirror the streaks
 * back on themselves.
 */

const W = 64
const H = 128

function draw(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const rand = rngFrom('waterfall-sheet-01')

  ctx.fillStyle = 'rgba(214,235,241,0.62)'
  ctx.fillRect(0, 0, W, H)

  // Streaks. Full height, so the texture tiles vertically without a seam.
  for (let i = 0; i < 46; i++) {
    const x = rand.next() * W
    const w = rand.range(0.8, 3.4)
    const alpha = rand.range(0.12, 0.5)
    ctx.fillStyle = rand.chance(0.5)
      ? `rgba(255,255,255,${alpha})`
      : `rgba(140,186,200,${alpha})`
    ctx.fillRect(x, 0, w, H)
  }

  // Broken highlights, to stop the streaks reading as a barcode.
  for (let i = 0; i < 90; i++) {
    const x = rand.next() * W
    const y = rand.next() * H
    const h = rand.range(4, 22)
    ctx.fillStyle = `rgba(255,255,255,${rand.range(0.1, 0.42)})`
    ctx.fillRect(x, y, rand.range(0.8, 2.2), h)
  }

  return canvas
}

let cache: THREE.CanvasTexture | null = null

/** Returns null when there is no DOM, so unit tests can build the rest. */
export function waterfallTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  if (!cache) {
    cache = new THREE.CanvasTexture(draw())
    cache.wrapS = THREE.ClampToEdgeWrapping
    cache.wrapT = THREE.RepeatWrapping
    cache.colorSpace = THREE.SRGBColorSpace
  }
  return cache
}

export function disposeWaterfallTexture(): void {
  cache?.dispose()
  cache = null
}
