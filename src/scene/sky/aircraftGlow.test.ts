import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { buildAirTraffic } from '@/air/aircraft'
import { timeOfDayConfig } from '@/config'
import { aircraftMaterials, applyAircraftTimeOfDay } from './aircraftResources'

/**
 * The balloons' burners after dark.
 *
 * A flame is the one thing on a hot-air balloon that is only visible at night,
 * and it has to arrive by the same route every other artificial light in this
 * scene does — the time-of-day blend — or it will be a second writer racing
 * the first.
 */
const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('balloon burners', () => {
  it('are written by the time-of-day driver, never by an effect on the hour', () => {
    // The rule the whole `applyBlend` path exists to enforce: an effect keyed
    // to the hour snaps to the TARGET the instant a transition begins, so the
    // sky would arrive at night while the tower was still crossing dusk.
    const blend = source('src/scene/timeOfDay/applyBlend.ts')
    expect(blend).toContain('applyAircraftTimeOfDay')

    const aircraft = source('src/scene/sky/aircraftResources.ts')
    expect(aircraft).toContain('export function applyAircraftTimeOfDay')
    // No `useEffect` in that file may depend on the hour.
    expect(aircraft).not.toMatch(/useEnvironmentStore\s*\(\s*\(s\)\s*=>\s*s\.hour/)
  })

  it('fires them in bursts, out of step with each other', () => {
    // A balloon's burner is intermittent. All of them lit continuously reads
    // as a string of lamps hanging in the sky; all of them lit TOGETHER reads
    // as one switch being thrown.
    const fleet = buildAirTraffic()
    const firing = (phase: number, t: number) => {
      const burn = Math.sin(t * 0.55 + phase * 7.3)
      return burn > 0.45 ? (burn - 0.45) / 0.55 : 0
    }
    for (const t of [0, 3, 11, 40, 200]) {
      const lit = fleet.balloons.filter((b) => firing(b.bobPhase, t) > 0).length
      // Some, never all and never none.
      expect(`t=${t}:${lit > 0 && lit < fleet.balloons.length}`).toBe(`t=${t}:true`)
    }
    // And the burn cycle is not shared: two balloons rarely agree.
    const atZero = fleet.balloons.map((b) => firing(b.bobPhase, 0).toFixed(3))
    expect(new Set(atZero).size).toBeGreaterThan(fleet.balloons.length / 3)
  })

  it('keeps the envelope glow well under the city windows', () => {
    // A balloon is scenery. If its envelope out-glows the tower it is drifting
    // past, the composition inverts — the same rule that caps the skyline.
    //
    // Measured against the presets rather than pinned to a literal in the
    // source: the number here was retuned the moment the glow started taking
    // each balloon's colour, and a test that reads the source only ever
    // catches the edit, never the inversion it is meant to prevent.
    // Built before the first write: `applyAircraftTimeOfDay` deliberately
    // returns early when nothing has asked for the materials yet.
    const envelope = aircraftMaterials().envelope
    for (const key of timeOfDayConfig.keys) {
      applyAircraftTimeOfDay(key.city.lampGlow)
      expect(`${key.hour}:${envelope.emissiveIntensity}`).toBe(
        `${key.hour}:${key.city.lampGlow * 0.35}`,
      )
      expect(envelope.emissiveIntensity).toBeLessThan(Math.max(key.city.windowGlow, 0.01))
    }
  })
})

describe('a balloon glows in its own colour', () => {
  it('tints the envelope\'s emissive by the instance colour', () => {
    // `instanceColor` multiplies the diffuse and nothing else, and after dark
    // there is no diffuse to tint — so without this every balloon in the fleet
    // glowed the same amber the moment the burners came on, however it was
    // painted. This is the only thing standing between a fleet and a set of
    // identical orange dots.
    const material = aircraftMaterials().envelope
    expect(material.onBeforeCompile).toBeTypeOf('function')

    const shader = {
      fragmentShader: 'void main() {\n#include <emissivemap_fragment>\n}',
      vertexShader: '',
      uniforms: {},
    }
    material.onBeforeCompile(shader as never, null as never)
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance *= balloonTint')
    // Normalised, not a plain multiply. Tinting by a colour also multiplies by
    // that colour's brightness, and these envelopes average about half — which
    // told the fleet apart by making all of it half as bright, and at this
    // glow level that is the difference between a balloon and nothing at all.
    expect(shader.fragmentShader).toContain('balloonTint / balloonLum')
    expect(shader.fragmentShader).toContain('vColor')
    // Guarded on the define three actually declares `vColor` under, and
    // reading the component count three actually gives it. Both are its
    // implementation detail; getting either wrong stops the fragment shader
    // compiling, and a shader that does not compile renders NOTHING — the
    // whole fleet vanished at every hour of the day on the vec3/vec4 slip
    // alone. Read out of three's own chunk so a version bump surfaces here
    // rather than as an empty sky.
    const parsChunk = THREE.ShaderChunk.color_pars_fragment
    const guard = /USE_INSTANCING_COLOR/.test(parsChunk) ? 'USE_INSTANCING_COLOR' : 'USE_COLOR'
    expect(shader.fragmentShader).toContain(`#ifdef ${guard}`)
    const swizzle = /varying vec4 vColor/.test(parsChunk) ? 'vColor.rgb' : 'vColor,'
    expect(shader.fragmentShader).toContain(swizzle)
  })

  it('keeps its own compiled program', () => {
    // Without a distinct cache key three shares one program between this
    // material and any untouched standard material with the same parameters,
    // and which of the two shaders the pair ends up with depends on draw order.
    const material = aircraftMaterials().envelope
    expect(material.customProgramCacheKey()).not.toBe(
      new THREE.MeshStandardMaterial().customProgramCacheKey(),
    )
  })
})
