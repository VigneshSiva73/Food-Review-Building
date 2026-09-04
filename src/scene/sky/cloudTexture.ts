import * as THREE from 'three'
import { rngFrom } from '@/utils/rng'

/**
 * One soft blob, shared by every puff in the sky.
 *
 * Alpha only — the colour comes from the hour, so the same texture serves a
 * white midday cloud and a bruised purple one at dusk. Baking a colour in here
 * would mean one texture per hour, or a tint that fights the one already
 * painted into the pixels.
 *
 * A plain radial gradient reads as an airbrushed dot, so seeded dabs are laid
 * over it to break the edge up. Seeded rather than random because there is one
 * of these and it is shared: a different blob each reload would change every
 * cloud in the sky at once.
 */

const SIZE = 128

function draw(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const rng = rngFrom('cloud-blob-01')

  ctx.clearRect(0, 0, SIZE, SIZE)

  const half = SIZE / 2
  const blob = (x: number, y: number, r: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${alpha})`)
    g.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.45})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // The body, then a scattering of smaller dabs biased toward the middle so the
  // silhouette stays soft at the rim and dense at the core.
  blob(half, half, half * 0.92, 0.85)
  for (let i = 0; i < 22; i++) {
    const angle = rng.next() * Math.PI * 2
    const radius = Math.pow(rng.next(), 0.7) * half * 0.5
    blob(
      half + Math.cos(angle) * radius,
      half + Math.sin(angle) * radius,
      half * rng.range(0.18, 0.42),
      rng.range(0.18, 0.5),
    )
  }

  return canvas
}

let cache: THREE.CanvasTexture | null = null

export function cloudTexture(): THREE.CanvasTexture {
  if (!cache) {
    cache = new THREE.CanvasTexture(draw())
    // Clamped, not wrapped: a billboard samples exactly one copy of this, and
    // wrapping would fold the far edge back over the near one.
    cache.wrapS = THREE.ClampToEdgeWrapping
    cache.wrapT = THREE.ClampToEdgeWrapping
    cache.colorSpace = THREE.SRGBColorSpace
  }
  return cache
}

export function disposeCloudTexture(): void {
  cache?.dispose()
  cache = null
}
