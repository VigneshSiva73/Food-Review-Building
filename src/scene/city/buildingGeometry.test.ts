import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildCityBuildings, buildCityLayout, type CityBuildingSpec } from '@/city'
import { cityConfig } from '@/config'
import { buildBuildingGeometry, FAMILY_OF, facadeTileSize } from './buildingGeometry'
import { skylineGeometry } from './cityResources'

const layout = buildCityLayout()
const specs = buildCityBuildings(layout, 'high').filter((b) => b.ring === 'inner')
const merged = buildBuildingGeometry(specs)

function faceNormal(geom: THREE.BufferGeometry, t: number): THREE.Vector3 {
  const pos = geom.getAttribute('position')
  const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3)
  const b = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 1)
  const c = new THREE.Vector3().fromBufferAttribute(pos, t * 3 + 2)
  return new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize()
}

const triCount = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3

describe('buildBuildingGeometry', () => {
  it('groups buildings by facade family, one buffer each', () => {
    const expected = new Set(specs.map((s) => FAMILY_OF[s.type]))
    expect(new Set(merged.facades.keys())).toEqual(expected)
    expect(merged.facades.size).toBeLessThanOrEqual(3)
  })

  it('emits at least a box per building, and more where the top is shaped', () => {
    // A building is no longer one extrusion with a lid. A parapet adds four
    // walls, a stepped top adds four and a deck, a plant room the same, and a
    // podium adds a whole lower mass — which is the point: from a camera that
    // looks down, the top of a building is most of what you see of it.
    const wallTris = [...merged.facades.values()].reduce((n, g) => n + triCount(g), 0)
    expect(wallTris).toBeGreaterThanOrEqual(specs.length * 8)
    expect(triCount(merged.roofs)).toBeGreaterThanOrEqual(specs.length * 2)
    // But still cheap: nothing here may average more than a couple of boxes.
    expect(wallTris).toBeLessThan(specs.length * 8 * 3)
  })

  it('faces every wall outward and every roof up', () => {
    // Same failure mode that made the road surface invisible in phase 2: wound
    // the wrong way, a whole block back-face culls and disappears.
    for (let t = 0; t < triCount(merged.roofs); t++) {
      expect(faceNormal(merged.roofs, t).y).toBeCloseTo(1)
    }

    const single = buildBuildingGeometry([specs[0]])
    const walls = [...single.facades.values()][0]
    const centre = new THREE.Vector3(specs[0].position.x, 0, specs[0].position.z)
    const pos = walls.getAttribute('position')
    for (let t = 0; t < triCount(walls); t++) {
      const n = faceNormal(walls, t)
      expect(Math.abs(n.y)).toBeLessThan(1e-6) // walls are vertical
      const a = new THREE.Vector3().fromBufferAttribute(pos, t * 3)
      const outward = new THREE.Vector3(a.x - centre.x, 0, a.z - centre.z)
      expect(n.dot(outward)).toBeGreaterThan(0)
    }
  })

  it('keeps windows the same size on every building', () => {
    // UVs are measured in world units, which is the whole reason these are
    // merged rather than instanced. A tall tower and a squat shop must agree.
    const tile = facadeTileSize()
    // Flat-topped and short enough for no podium, so the measurement is of
    // the main mass alone rather than of whatever sits on top of it.
    const plain = { ...specs[0], roof: 'flat', floors: 4, rotationY: 0 } as CityBuildingSpec
    const tall = { ...plain, height: 300, width: 40, depth: 40 } as CityBuildingSpec
    const squat = { ...plain, height: 30, width: 40, depth: 40 } as CityBuildingSpec

    const vTop = (spec: CityBuildingSpec) => {
      const g = [...buildBuildingGeometry([spec]).facades.values()][0]
      const uv = g.getAttribute('uv')
      let max = 0
      for (let i = 0; i < uv.count; i++) max = Math.max(max, uv.getY(i))
      return max
    }
    expect(vTop(tall)).toBeCloseTo(300 / tile.height)
    expect(vTop(squat)).toBeCloseTo(30 / tile.height)
    // Ten times the height means ten times the window rows, not stretched ones.
    expect(vTop(tall) / vTop(squat)).toBeCloseTo(10)
  })

  it('stands every building on the ground, its roof form on top of it', () => {
    const b = cityConfig.buildings
    // The most a top can add: a stepped crown is the tallest of the three.
    const tallestTop = b.roof.stepStoreys.max * b.storeyHeight
    for (const spec of specs.slice(0, 8)) {
      const g = [...buildBuildingGeometry([spec]).facades.values()][0]
      g.computeBoundingBox()
      expect(g.boundingBox!.min.y).toBeCloseTo(0)
      // Relative slack: the positions are Float32Array and the bound is
      // computed in double, so a fixed 1e-6 is finer than a float32 can carry
      // above about eight units. Same trap the glazing bound fell into.
      const slack = spec.height * 2 ** -22 + 1e-6
      expect(g.boundingBox!.max.y).toBeGreaterThanOrEqual(spec.height - slack)
      expect(g.boundingBox!.max.y).toBeLessThanOrEqual(spec.height + tallestTop + slack)
    }
  })

  it('carries a per-building tint on vertex colours', () => {
    for (const geom of merged.facades.values()) {
      const colors = geom.getAttribute('color')
      expect(colors.count).toBe(geom.getAttribute('position').count)
    }
  })

  it('derives the facade tile from the storey height, so floors line up', () => {
    const tile = facadeTileSize()
    expect(tile.height).toBeCloseTo(
      cityConfig.buildings.storeyHeight * cityConfig.facade.tileRows,
    )
    expect(tile.width).toBeCloseTo(cityConfig.facade.paneWidth * cityConfig.facade.tileCols)
  })
})

describe('skylineGeometry', () => {
  it('stands on the ground, so a scaled mass is not half-buried', () => {
    // The unit box is translated up by half its height; without that, scaling
    // y would sink every silhouette to its waist in the terrain.
    const geom = skylineGeometry()
    geom.computeBoundingBox()
    expect(geom.boundingBox!.min.y).toBeCloseTo(0)
    expect(geom.boundingBox!.max.y).toBeCloseTo(1)
  })
})
