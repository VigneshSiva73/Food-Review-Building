import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildBlockTrees, buildStreetProps, buildCityLayout, buildCityBuildings, buildHouses } from '@/city'
import { buildHeightField } from '@/terrain/heightField'
import { buildTrees } from '@/terrain/vegetation'
import { islandConfig } from '@/config'
import { computeQualityTier } from '@/utils/quality'
import { GROUND_LAYERS } from './cityResources'

describe('map', () => {
  it('dumps', () => {
    const layout = buildCityLayout()
    const tier = computeQualityTier(1600, false)
    const props = buildStreetProps(layout, tier.cityDensity, GROUND_LAYERS)
    const cityTrees = [...props.trees, ...buildBlockTrees(tier.cityDensity)]
    const island = buildTrees(buildHeightField(), islandConfig.vegetation.count)
    const buildings = buildCityBuildings(layout, tier.cityDensity)
    const houses = buildHouses()

    const lines: string[] = []
    for (const r of layout.roads) {
      lines.push(`R ${r.axis} ${r.center} ${r.from} ${r.to} ${r.halfWidth ?? 5}`)
    }
    for (const b of buildings) lines.push(`B ${b.position.x} ${b.position.z} ${b.width ?? 20} ${b.depth ?? 20}`)
    for (const h of houses) lines.push(`B ${h.position.x} ${h.position.z} ${h.width} ${h.depth}`)
    for (const t of cityTrees) lines.push(`C ${t.position.x} ${t.position.z}`)
    for (const t of island) lines.push(`I ${t.x} ${t.z}`)
    writeFileSync('/tmp/map.txt', lines.join('\n'))
  }, 180000)
})
