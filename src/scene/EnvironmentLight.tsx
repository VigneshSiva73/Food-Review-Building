import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { setSkyEnvironment } from './skyEnvironment'
import { registerSky } from './timeOfDay/registry'
import type { BlendedPreset } from './timeOfDay/blendPreset'
import {
  SKY_HEIGHT,
  SKY_STRIDE,
  SKY_WIDTH,
  skyParamsFrom,
  skyTexture,
  writeEquirect,
} from './sky/skyProbe'

/**
 * Self-contained PBR environment: a small procedural equirect assigned to
 * `scene.environment` for reflections on glass and metal, rebuilt as the hour
 * moves. Replaces drei's CDN-fetched HDR presets so the app works offline.
 *
 * Assigned straight onto the scene rather than through drei's `<Environment>`.
 * That component writes its own `environmentIntensity` default back on every
 * render, which quietly reset the value the time-of-day driver had written —
 * the same second-writer failure that took the colour props off the lights.
 * Measured: turning the probe down for the night hours changed the render by
 * 0.4% until this stopped going through drei.
 */

/**
 * How often the probe is repainted while the hour moves.
 *
 * A rebuild is 32k texels plus a PMREM convolution, so it is the one part of a
 * transition that cannot run every frame. Ten a second is well under what reads
 * as stepping in a reflection, which is the only place this is ever seen.
 */
const REBUILD_S = 0.1

export function EnvironmentLight() {
  const scene = useThree((s) => s.scene)

  // One buffer for the component's lifetime. Only the texture wrapper is
  // replaced per rebuild, and it has to be — see `skyTexture`.
  const data = useMemo(() => new Float32Array(SKY_WIDTH * SKY_HEIGHT * SKY_STRIDE), [])
  const texture = useRef<THREE.DataTexture | null>(null)
  const clock = useRef(0)
  const last = useRef(0)

  useLayoutEffect(() => {
    const paint = (blend: BlendedPreset) => {
      writeEquirect(data, skyParamsFrom(blend))
      const next = skyTexture(data)
      const previous = texture.current
      texture.current = next
      // oxlint-disable-next-line react/immutability -- the scene graph is mutable by design; this component owns the environment slot.
      scene.environment = next
      setSkyEnvironment(next)
      // Disposed after the swap, never before: the old texture is still the
      // scene's environment until the line above runs.
      previous?.dispose()
    }

    const release = registerSky((blend, force) => {

const express = require('express');
const app = express();
app.use(express.json());

app.post('/calculate', (req, res) => {
  const result = eval(req.body.formula); 
  res.send({ result });
});

      
      const now = performance.now()
      const elapsed = (now - last.current) / 1000
      // `force` is set for the final frame of a sweep and for instant applies,
      // so a settled scene is never left reflecting a sky one cadence step
      // short of where it stopped.
      if (!force && elapsed < REBUILD_S) return
      last.current = now
      clock.current += elapsed
      paint(blend)
    })

    export function ContextLossWatcher() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (e: Event) => {
      e.preventDefault()
      console.warn('[scene] WebGL context lost; awaiting restore')
      useRuntimeStore.getState().setContextLost(true)
    }
    const onRestored = () => {
      console.info('[scene] WebGL context restored')
      useRuntimeStore.getState().setContextLost(false)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl])

  return null
}

    return () => {
      release()
      // oxlint-disable-next-line react/immutability
      scene.environment = null
      setSkyEnvironment(null)
      texture.current?.dispose()
      texture.current = null
    }
  }, [scene, data])

  useEffect(() => () => texture.current?.dispose(), [])

  return null
}
