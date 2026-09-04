import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Attraction, CivicFacility, Playground, ThemePark } from '@/city'

/**
 * The theme park's rides, as one merged, vertex-coloured buffer.
 *
 * A ferris wheel is the one thing in this city that cannot be a box, and a
 * park of boxes would be exactly the "collection of random objects" the brief
 * warns against — the silhouette is the whole point of a fairground. So the
 * four ride types get real shapes, and every one of them goes into a single
 * buffer with its colour baked into the vertices, because the environment has
 * one draw call left of its twenty-eight.
 *
 * They are cheap: the whole park is about the cost of thirty street trees.
 */

const STEEL = new THREE.Color('#8e9299')
const STALL_BODY = new THREE.Color('#d8cfbe')
const PAINT: readonly THREE.Color[] = [
  '#c2503f',
  '#3f7fc2',
  '#d2a03a',
  '#4f9d63',
  '#a558a0',
].map((hex) => new THREE.Color(hex))

/** Colour a geometry's vertices and hand it back for merging. */
function tinted(geom: THREE.BufferGeometry, colour: THREE.Color): THREE.BufferGeometry {
  const count = geom.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = colour.r
    colors[i * 3 + 1] = colour.g
    colors[i * 3 + 2] = colour.b
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geom.deleteAttribute('uv')
  return geom
}

function place(geom: THREE.BufferGeometry, a: Attraction): THREE.BufferGeometry {
  geom.rotateY(a.rotationY)
  geom.translate(a.position.x, 0, a.position.z)
  return geom
}

function ride(a: Attraction): THREE.BufferGeometry[] {
  const paint = PAINT[Math.floor(a.variant * PAINT.length) % PAINT.length]
  const parts: THREE.BufferGeometry[] = []

  switch (a.kind) {
    case 'wheel': {
      // A vertical ring on two legs. The ring is a thin torus rather than a
      // disc, because a fairground wheel reads by the gap inside it.
      const hub = a.height - a.radius
      const ring = new THREE.TorusGeometry(a.radius, a.radius * 0.055, 6, 22)
      ring.translate(0, hub, 0)
      parts.push(tinted(ring, paint))
      for (const side of [-1, 1]) {
        const leg = new THREE.CylinderGeometry(0.7, 1.1, hub, 5)
        leg.translate(side * a.radius * 0.45, hub / 2, 0)
        parts.push(tinted(leg, STEEL))
      }
      // Cars around the rim, which is what stops it reading as a hoop.
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        const car = new THREE.BoxGeometry(2.2, 2.4, 2.2)
        car.translate(Math.cos(angle) * a.radius, hub + Math.sin(angle) * a.radius, 0)
        parts.push(tinted(car, PAINT[(i + 1) % PAINT.length]))
      }
      break
    }
    case 'tower': {
      const mast = new THREE.CylinderGeometry(a.radius * 0.35, a.radius * 0.55, a.height, 6)
      mast.translate(0, a.height / 2, 0)
      parts.push(tinted(mast, STEEL))
      // The gondola, parked partway up, and a cap so the mast has a top.
      const car = new THREE.CylinderGeometry(a.radius, a.radius, 2.4, 8, 1, true)
      car.translate(0, a.height * 0.42, 0)
      parts.push(tinted(car, paint))
      const cap = new THREE.ConeGeometry(a.radius * 0.7, 4, 6)
      cap.translate(0, a.height + 2, 0)
      parts.push(tinted(cap, paint))
      break
    }
    case 'carousel': {
      const deck = new THREE.CylinderGeometry(a.radius, a.radius, 0.6, 12)
      deck.translate(0, 0.3, 0)
      parts.push(tinted(deck, STEEL))
      const roof = new THREE.ConeGeometry(a.radius * 1.08, a.height * 0.42, 12)
      roof.translate(0, a.height * 0.79, 0)
      parts.push(tinted(roof, paint))
      const column = new THREE.CylinderGeometry(a.radius * 0.12, a.radius * 0.12, a.height, 6)
      column.translate(0, a.height / 2, 0)
      parts.push(tinted(column, STEEL))
      break
    }
    case 'coaster': {
      // A run of arches of falling height. Not a track — a track is hundreds
      // of segments — but the profile of one, which is what carries at range.
      const bays = 7
      for (let i = 0; i < bays; i++) {
        const t = i / (bays - 1)
        const h = a.height * (0.35 + 0.65 * Math.sin((1 - t) * Math.PI * 0.85))
        const x = (t - 0.5) * a.radius * 2
        const post = new THREE.BoxGeometry(1.1, h, 1.1)
        post.translate(x, h / 2, 0)
        parts.push(tinted(post, STEEL))
        if (i > 0) {
          const prev = a.height * (0.35 + 0.65 * Math.sin((1 - (i - 1) / (bays - 1)) * Math.PI * 0.85))
          const rail = new THREE.BoxGeometry((a.radius * 2) / (bays - 1), 0.9, 1.6)
          rail.translate(x - a.radius / (bays - 1), (h + prev) / 2, 0)
          rail.rotateZ(Math.atan2(h - prev, (a.radius * 2) / (bays - 1)) * 0.5)
          parts.push(tinted(rail, paint))
        }
      }
      break
    }
    case 'stall': {
      const body = new THREE.BoxGeometry(a.radius * 2, a.height * 0.7, a.radius * 1.5)
      body.translate(0, a.height * 0.35, 0)
      parts.push(tinted(body, STALL_BODY))
      // A striped awning is beyond one buffer's means, so a coloured canopy.
      const awning = new THREE.BoxGeometry(a.radius * 2.5, 0.35, a.radius * 2.2)
      awning.translate(0, a.height * 0.78, 0)
      parts.push(tinted(awning, paint))
      break
    }
  }

  return parts.map((p) => place(p, a))
}

const CANOPY = new THREE.Color('#d6d9dc')
const PUMP = new THREE.Color('#b8493c')

/**
 * A filling station's canopy and pumps.
 *
 * The canopy is what makes a petrol station recognisable from the air — a
 * flat white roof standing clear of everything around it — and it cannot come
 * out of the building merger, which knows how to extrude a footprint and
 * nothing about a slab on legs.
 */
function forecourt(f: CivicFacility): THREE.BufferGeometry[] {
  const apron = f.aprons[0]
  if (!apron) return []
  const parts: THREE.BufferGeometry[] = []
  const alongX = apron.halfW >= apron.halfD
  const width = Math.min(apron.halfW, apron.halfD) * 1.35
  const length = Math.max(apron.halfW, apron.halfD) * 0.95
  const height = 6.2

  const deck = new THREE.BoxGeometry(
    alongX ? length * 2 : width * 2,
    0.75,
    alongX ? width * 2 : length * 2,
  )
  deck.translate(apron.cx, height, apron.cz)
  parts.push(tinted(deck, CANOPY))

  // Four columns, inset from the deck so it reads as cantilevered.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.CylinderGeometry(0.55, 0.55, height, 6)
      column.translate(
        apron.cx + sx * (alongX ? length : width) * 0.62,
        height / 2,
        apron.cz + sz * (alongX ? width : length) * 0.55,
      )
      parts.push(tinted(column, CANOPY))
    }
  }

  // Two islands of pumps under it, running the long way.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const offset = (i - 0.5) * length * 0.8
      const pump = new THREE.BoxGeometry(1.1, 2.1, 0.75)
      pump.translate(
        apron.cx + (alongX ? offset : side * width * 0.3),
        1.05,
        apron.cz + (alongX ? side * width * 0.3 : offset),
      )
      parts.push(tinted(pump, PUMP))
    }
  }
  return parts
}

const PLAY: readonly THREE.Color[] = ['#c8523f', '#3f86c8', '#d8b03a', '#4f9d63'].map(
  (hex) => new THREE.Color(hex),
)

/**
 * Playground equipment.
 *
 * Small, and deliberately so: a climbing frame that reads at the scale of a
 * ferris wheel is not a playground, it is a folly. Three shapes are enough to
 * tell one from a car park at the distance these are seen from.
 */
function equipment(ground: Playground): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  for (const [i, s] of ground.structures.entries()) {
    const colour = PLAY[i % PLAY.length]
    const at = (g: THREE.BufferGeometry) => {
      g.rotateY(s.rotationY)
      g.translate(s.position.x, 0, s.position.z)
      parts.push(tinted(g, colour))
    }
    if (s.kind === 'frame') {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const post = new THREE.BoxGeometry(0.3, s.size, 0.3)
          post.translate(sx * s.size * 0.4, s.size / 2, sz * s.size * 0.4)
          at(post)
        }
      }
      const bar = new THREE.BoxGeometry(s.size, 0.3, 0.3)
      bar.translate(0, s.size, 0)
      at(bar)
    } else if (s.kind === 'slide') {
      const deck = new THREE.BoxGeometry(s.size * 0.6, 0.3, s.size * 0.6)
      deck.translate(0, s.size * 0.7, 0)
      at(deck)
      const chute = new THREE.BoxGeometry(0.9, 0.25, s.size * 1.3)
      chute.rotateX(0.55)
      chute.translate(0, s.size * 0.38, s.size * 0.7)
      at(chute)
      const leg = new THREE.BoxGeometry(0.3, s.size * 0.7, 0.3)
      leg.translate(0, s.size * 0.35, -s.size * 0.2)
      at(leg)
    } else {
      const disc = new THREE.CylinderGeometry(s.size * 0.55, s.size * 0.55, 0.35, 8)
      disc.translate(0, 0.35, 0)
      at(disc)
    }
  }
  return parts
}

/**
 * Every ride, forecourt canopy and swing frame, in one buffer.
 *
 * They share it because the environment is at its draw-call ceiling and both
 * are the same kind of thing: small merged detail that no other buffer can
 * express. Null when there is nothing to draw.
 */
export function attractionGeometry(
  park: ThemePark | null,
  facilities: CivicFacility[] = [],
  playgrounds: Playground[] = [],
): THREE.BufferGeometry | null {
  const parts = [
    ...(park?.attractions ?? []).flatMap(ride),
    ...facilities.filter((f) => f.kind === 'fuel').flatMap(forecourt),
    ...playgrounds.flatMap(equipment),
  ]
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  return merged
}
