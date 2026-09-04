import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { islandConfig } from '@/config/islandConfig'
import { buildHeightField } from './heightField'

// A development tool, not a test: run with ISLAND_MAP=1 to regenerate the
// top-down PNG that terrain changes are reviewed against. Skipped otherwise so
// it neither slows the suite nor writes a file during an ordinary run.
describe('island map', () => {
  it.skipIf(!process.env.ISLAND_MAP)('dumps the field', () => {
    const f = buildHeightField()
    const rows: string[] = []
    for (let j = 0; j < f.size; j++) {
      const r: string[] = []
      for (let i = 0; i < f.size; i++) {
        const n = j * f.size + i
        r.push(`${f.height[n].toFixed(1)}|${f.flow[n].toFixed(0)}|${f.shelf[n].toFixed(2)}`)
      }
      rows.push(r.join(','))
    }
    writeFileSync(
      '.shots/field.txt',
      `${f.size} ${f.half} ${islandConfig.world.seaLevel}\n${rows.join('\n')}`,
    )
  }, 120000)
})
