import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cityConfig } from '@/config'
import { triangleCount } from '../geometryStats'
import {
  benchGeometry,
  binGeometry,
  bollardGeometry,
  busStopGeometry,
  coconutCanopyFarGeometry,
  coconutCanopyGeometry,
  coconutTrunkGeometry,
  lampGeometry,
  treeCanopyGeometry,
  treeTrunkGeometry,
} from './propGeometry'

const bounds = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!
}

const STANDING = {
  trunk: treeTrunkGeometry,
  canopy: treeCanopyGeometry,
  coconutTrunk: coconutTrunkGeometry,
  coconutCanopy: coconutCanopyGeometry,
  coconutCanopyFar: coconutCanopyFarGeometry,
  lamp: lampGeometry,
  bench: benchGeometry,
  bin: binGeometry,
  bollard: bollardGeometry,
  busStop: busStopGeometry,
}

describe('prop geometry', () => {
  it('stands every prop on y = 0', () => {
    // Instance transforms carry only a ground position, so anything whose
    // origin is not at its foot would float or sink — and with several hundred
    // instances that is not something a screenshot reliably reveals.
    for (const [name, build] of Object.entries(STANDING)) {
      const floor = bounds(build()).min.y
      expect(`${name}:${Math.abs(floor) < 1e-6}`).toBe(`${name}:true`)
    }
  })

  it('makes the trunk and canopy unit-scalable', () => {
    // A y scale must be the trunk height and the canopy's half-height exactly,
    // or tree proportions drift from what the pure layer generated.
    expect(bounds(treeTrunkGeometry()).max.y).toBeCloseTo(1)
    const canopy = bounds(treeCanopyGeometry())
    expect(canopy.max.y).toBeCloseTo(2)
    expect(canopy.max.x).toBeCloseTo(1)
  })

  it('reaches the lamp arm out over the road, along +Z', () => {
    // Props are modelled facing +Z and rotated by `faceRoadYaw`; an arm built
    // along -Z would light the building line instead of the carriageway.
    const b = bounds(lampGeometry())
    expect(b.max.z).toBeGreaterThan(1.5)
    expect(b.min.z).toBeCloseTo(-0.13)
    expect(b.max.y).toBeCloseTo(cityConfig.props.lampHeight)
  })

  it('puts the bench back behind the seat', () => {
    const b = bounds(benchGeometry())
    expect(b.min.z).toBeLessThan(-0.25)
    expect(b.max.z).toBeGreaterThan(0.25)
  })

  it('caches each geometry so instances share one buffer', () => {
    expect(treeCanopyGeometry()).toBe(treeCanopyGeometry())
    expect(lampGeometry()).toBe(lampGeometry())
  })

  it('keeps every prop cheap enough to instance in the hundreds', () => {
    // The ceiling was 120 when this counted `position.count / 3`, which on an
    // indexed geometry is vertices over three, not triangles. Corrected, the
    // bus shelter's seven parts come to 132 — it was never over budget, the
    // measurement was wrong. 160 keeps a runaway prop caught.
    const tris = triangleCount
    for (const [name, build] of Object.entries(STANDING)) {
      expect(`${name}:${tris(build()) <= 160}`).toBe(`${name}:true`)
    }
  })
})
