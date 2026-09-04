import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Unit geometry for everything in the air, built once and instanced.
 *
 * All three are modelled at unit size around their own hanging point, so an
 * instance transform is "put it here, this big, turned that way" and nothing
 * needs per-craft bookkeeping — the same contract the street props use.
 *
 * Deliberately coarse. A balloon at four hundred units up is a few dozen
 * pixels, and the silhouette is the whole of what reads: an envelope, a
 * basket under it, a canopy, a fuselage with a rotor over it. Detail beyond
 * that is triangles nobody can see.
 */

const cache = new Map<string, THREE.BufferGeometry>()

function cached(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = cache.get(key)
  if (!geom) {
    geom = build()
    cache.set(key, geom)
  }
  return geom
}

/**
 * A balloon envelope of unit radius, hanging from the origin.
 *
 * A sphere squashed at the top and drawn out to a throat at the bottom, which
 * is the shape that tells a balloon from a ball at any distance.
 */
export function balloonEnvelopeGeometry(): THREE.BufferGeometry {
  return cached('balloon', () => {
    const g = new THREE.SphereGeometry(1, 10, 8)
    const pos = g.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      // Below the equator the envelope tapers toward the mouth.
      const taper = y < 0 ? 1 - 0.72 * (-y) ** 1.4 : 1
      pos.setX(i, pos.getX(i) * taper)
      pos.setZ(i, pos.getZ(i) * taper)
      pos.setY(i, y * 1.18 + 1.3)
    }
    g.computeVertexNormals()
    return g
  })
}

/** The basket, hanging below the origin on its lines. */
export function balloonBasketGeometry(): THREE.BufferGeometry {
  return cached('basket', () => {
    const basket = new THREE.BoxGeometry(0.42, 0.34, 0.42)
    basket.translate(0, -0.5, 0)
    const parts: THREE.BufferGeometry[] = [basket]
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const line = new THREE.BoxGeometry(0.03, 0.42, 0.03)
        line.translate(sx * 0.17, -0.13, sz * 0.17)
        parts.push(line)
      }
    }
    const merged = mergeGeometries(parts, false)!
    for (const p of parts) p.dispose()
    return merged
  })
}

/**
 * The burner flame, at the mouth of the envelope.
 *
 * A cone standing on the basket's rigging and pointing UP into the throat,
 * which is where a burner actually fires. Small: what carries at night is the
 * light it throws on the inside of the envelope, not the flame's own outline.
 */
export function balloonBurnerGeometry(): THREE.BufferGeometry {
  return cached('burner', () => {
    const g = new THREE.ConeGeometry(0.13, 0.42, 6)
    g.translate(0, -0.14, 0)
    return g
  })
}

/**
 * A parachute: canopy, lines and the jumper under them, unit radius.
 *
 * One geometry rather than three meshes. The jumper takes the canopy's tint
 * as a result, which at this distance is a dark speck either way.
 */
export function parachuteGeometry(): THREE.BufferGeometry {
  return cached('chute', () => {
    // A hemisphere, open downward — a canopy reads by its dome and its edge.
    const canopy = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2.1)
    canopy.scale(1, 0.62, 1)
    const parts: THREE.BufferGeometry[] = [canopy]
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const line = new THREE.BoxGeometry(0.02, 1.1, 0.02)
      line.translate(Math.cos(angle) * 0.5, -0.55, Math.sin(angle) * 0.5)
      parts.push(line)
    }
    const jumper = new THREE.BoxGeometry(0.16, 0.34, 0.12)
    jumper.translate(0, -1.25, 0)
    parts.push(jumper)
    const merged = mergeGeometries(parts, false)!
    for (const p of parts) p.dispose()
    return merged
  })
}

/** Fuselage, tail boom and skids. The rotor is separate, because it turns. */
export function helicopterBodyGeometry(): THREE.BufferGeometry {
  return cached('heli', () => {
    const parts: THREE.BufferGeometry[] = []
    const cabin = new THREE.SphereGeometry(0.62, 8, 6)
    cabin.scale(0.8, 0.72, 1.25)
    parts.push(cabin)
    const boom = new THREE.BoxGeometry(0.16, 0.18, 1.5)
    boom.translate(0, 0.16, -1.15)
    parts.push(boom)
    const fin = new THREE.BoxGeometry(0.08, 0.46, 0.3)
    fin.translate(0, 0.4, -1.8)
    parts.push(fin)
    // Tail rotor, stationary: at this size a second spinning part is a pixel.
    const tailRotor = new THREE.BoxGeometry(0.04, 0.44, 0.44)
    tailRotor.translate(0.1, 0.4, -1.82)
    parts.push(tailRotor)
    for (const sx of [-1, 1]) {
      const skid = new THREE.BoxGeometry(0.07, 0.07, 1.1)
      skid.translate(sx * 0.36, -0.66, 0.05)
      parts.push(skid)
    }
    const mast = new THREE.BoxGeometry(0.12, 0.3, 0.12)
    mast.translate(0, 0.72, 0)
    parts.push(mast)
    const merged = mergeGeometries(parts, false)!
    for (const p of parts) p.dispose()
    return merged
  })
}

/** The main rotor, centred on its mast so an instance can spin it in place. */
export function helicopterRotorGeometry(): THREE.BufferGeometry {
  return cached('rotor', () => {
    const parts: THREE.BufferGeometry[] = []
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.BoxGeometry(0.1, 0.03, 3.4)
      blade.rotateY((i / 2) * Math.PI)
      parts.push(blade)
    }
    const merged = mergeGeometries(parts, false)!
    merged.translate(0, 0.88, 0)
    for (const p of parts) p.dispose()
    return merged
  })
}

export function disposeAircraftGeometry(): void {
  for (const g of cache.values()) g.dispose()
  cache.clear()
}
