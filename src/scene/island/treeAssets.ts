import * as THREE from 'three'
import { rngFrom } from '@/utils/rng'
import type { Species } from '@/terrain/vegetation'

/**
 * Trees, as crossed billboards.
 *
 * Twenty thousand solid tree meshes is half a million triangles of scenery
 * standing next to a city that is budgeted at three hundred and fifty thousand.
 * Two crossed quads is four, and at the distance an island is looked at the
 * difference is invisible — this is the oldest trick in real-time foliage and
 * it is the right one here.
 *
 * Crossed rather than camera-facing on purpose: a billboard that turns to face
 * the viewer has to be rewritten every frame, and under a demand frameloop that
 * would mean the whole forest becoming per-frame work. Fixed crossed quads are
 * a static buffer that never needs touching, and from above — which is how this
 * island is mostly seen — the cross reads better than a single card anyway.
 */

/** Two quads at right angles, standing on the origin, one unit tall. */
export function crossedQuadGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1)
  a.translate(0, 0.5, 0)
  const b = a.clone()
  b.rotateY(Math.PI / 2)

  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array(a.attributes.position.count * 3 * 2)
  const uvs = new Float32Array(a.attributes.uv.count * 2 * 2)
  const normals = new Float32Array(positions.length)

  const parts = [a, b]
  let p = 0
  let u = 0
  for (const part of parts) {
    const pos = part.attributes.position
    const uv = part.attributes.uv
    const nrm = part.attributes.normal
    for (let i = 0; i < pos.count; i++) {
      positions[p] = pos.getX(i)
      normals[p++] = nrm.getX(i)
      positions[p] = pos.getY(i)
      normals[p++] = nrm.getY(i)
      positions[p] = pos.getZ(i)
      normals[p++] = nrm.getZ(i)
      uvs[u++] = uv.getX(i)
      uvs[u++] = uv.getY(i)
    }
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  // Straight up, so a tree is lit by the sky rather than by whichever way its
  // card happens to face — which is what stops a forest flickering light and
  // dark as the sun moves across it.
  for (let i = 0; i < normals.length; i += 3) {
    normals[i] = 0
    normals[i + 1] = 1
    normals[i + 2] = 0
  }
  geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  const quads = 2
  const index = new Uint16Array(quads * 6)
  for (let q = 0; q < quads; q++) {
    const o = q * 4
    index.set([o, o + 2, o + 1, o + 2, o + 3, o + 1], q * 6)
  }
  geom.setIndex(new THREE.BufferAttribute(index, 1))
  geom.computeBoundingSphere()
  a.dispose()
  b.dispose()
  return geom
}

const SIZE = 96

/**
 * One canopy per species, drawn with alpha so the card disappears around it.
 *
 * Seeded, because there is one texture per species shared by every instance of
 * it: a different blob each reload would change the whole forest at once.
 */
function drawCanopy(species: Species): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const rand = rngFrom(`tree:${species}`)
  ctx.clearRect(0, 0, SIZE, SIZE)

  const trunkWidth = species === 'palm' ? SIZE * 0.045 : SIZE * 0.075
  const trunkTop = species === 'palm' ? SIZE * 0.34 : SIZE * 0.52
  ctx.fillStyle = species === 'palm' ? '#6d5a3f' : '#4a3a2c'
  ctx.fillRect(SIZE / 2 - trunkWidth / 2, trunkTop, trunkWidth, SIZE - trunkTop)

  const blob = (cx: number, cy: number, r: number, fill: string) => {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * rand.range(0.72, 0.95), 0, 0, Math.PI * 2)
    ctx.fill()
  }

  if (species === 'palm') {
    // Fronds radiating from the crown, drooping. Deliberately sparse: a palm
    // reads by its gaps as much as by its leaves.
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + rand.range(-0.2, 0.2)
      const len = SIZE * rand.range(0.26, 0.38)
      ctx.strokeStyle = i % 2 ? '#4f7a3a' : '#3f6630'
      ctx.lineWidth = SIZE * 0.055
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(SIZE / 2, trunkTop)
      ctx.quadraticCurveTo(
        SIZE / 2 + Math.cos(angle) * len * 0.6,
        trunkTop - Math.abs(Math.sin(angle)) * len * 0.5,
        SIZE / 2 + Math.cos(angle) * len,
        trunkTop + len * 0.34,
      )
      ctx.stroke()
    }
  } else if (species === 'conifer') {
    // Stacked tiers, narrowing upward.
    for (let tier = 0; tier < 4; tier++) {
      const t = tier / 3
      const y = trunkTop - SIZE * 0.02 - t * SIZE * 0.42
      const w = SIZE * (0.34 - t * 0.2)
      ctx.fillStyle = tier % 2 ? '#2f4a2c' : '#37562f'
      ctx.beginPath()
      ctx.moveTo(SIZE / 2 - w, y)
      ctx.lineTo(SIZE / 2 + w, y)
      ctx.lineTo(SIZE / 2, y - SIZE * 0.2)
      ctx.closePath()
      ctx.fill()
    }
  } else {
    // Broadleaf: overlapping blobs, biggest in the middle.
    blob(SIZE / 2, trunkTop - SIZE * 0.12, SIZE * 0.27, '#3d5f30')
    for (let i = 0; i < 6; i++) {
      const angle = rand.next() * Math.PI * 2
      const r = rand.range(0.06, 0.2) * SIZE
      blob(
        SIZE / 2 + Math.cos(angle) * SIZE * rand.range(0.05, 0.2),
        trunkTop - SIZE * 0.14 + Math.sin(angle) * SIZE * rand.range(0.04, 0.16),
        r,
        i % 2 ? '#48703a' : '#355428',
      )
    }
  }
  return canvas
}

const cache = new Map<Species, THREE.CanvasTexture>()

/** Returns null when there is no DOM, so unit tests can build the rest. */
export function canopyTexture(species: Species): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  let tex = cache.get(species)
  if (!tex) {
    tex = new THREE.CanvasTexture(drawCanopy(species))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    cache.set(species, tex)
  }
  return tex
}

export function disposeCanopyTextures(): void {
  cache.forEach((t) => t.dispose())
  cache.clear()
}
