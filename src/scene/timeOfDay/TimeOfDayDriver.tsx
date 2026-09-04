import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { timeOfDayConfig } from '@/config'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { MAX_FRAME_DELTA_S, prefersReducedMotion } from '@/utils/motion'
import { emptyBlend, type BlendedPreset } from './blendPreset'
import { normalizeHour, presetAt } from './presetAt'
import { applyBlend } from './applyBlend'
import { registerScene, setRegistrationListener } from './registry'
import {
  createHourTransition,
  durationFor,
  forwardDistance,
  retargetHour,
  tickHour,
} from './hourTransition'

/**
 * The one thing that writes the scene's lighting.
 *
 * Modelled on `ConstructionAnimator`: a clock in a ref, delta clamped, the
 * frozen shadow map poked at a fixed cadence, `invalidate()` each frame under
 * demand rendering, and an exact final write when the clock runs out.
 *
 * It owns the photometrics at rest as well as in flight. That is deliberate and
 * is why the lights and the background carry no colour props any more: two
 * writers on the same values means React can re-commit the *target* mid-sweep
 * and flash the destination for a frame.
 */

/**
 * How often the shadow map is re-rendered while the light moves.
 *
 * The same cadence the construction intro uses, and for the same reason: the
 * map is frozen, so a moving caster leaves stale shadows until something asks
 * for a redraw. Ten a second is invisible as stepping and costs a fraction of
 * what an unfrozen map would.
 */
const SHADOW_REFRESH_S = 0.1

/**
 * How often the running hour is written back to the store while cycling.
 *
 * Only so the slider thumb creeps along with the sky. Writing every frame would
 * re-render React sixty times a second to move a control by a pixel, which is
 * the sort of thing that makes a scene feel expensive for no visible gain.
 */
const STORE_WRITEBACK_S = 0.5

export function TimeOfDayDriver() {
  const hour = useEnvironmentStore((s) => s.hour)
  const hourJump = useEnvironmentStore((s) => s.hourJump)
  const autoCycle = useEnvironmentStore((s) => s.autoCycle)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  // The hour and the blend currently on screen. One buffer for the component's
  // lifetime; every frame writes into it rather than allocating.
  const liveHour = useRef(hour)
  const live = useRef<BlendedPreset>(null as unknown as BlendedPreset)
  if (live.current === null) live.current = presetAt(hour, emptyBlend())

  const transition = useRef(createHourTransition(hour))
  const shadowClock = useRef(0)
  const writeBackClock = useRef(0)
  const mounted = useRef(false)
  // Read inside the frame loop, which must not re-subscribe when it changes,
  // so it is mirrored into a ref — in an effect rather than during render,
  // since a render that React discards would otherwise leave the ref ahead of
  // the state it mirrors.
  const auto = useRef(autoCycle)
  /**
   * The last hour this driver wrote back itself.
   *
   * The cycle reports its progress to the store so the slider thumb creeps
   * along, and that write lands on the same `hour` the retarget effect below
   * watches. Without this guard the driver would answer its own message twice a
   * second — starting a fresh transition, taking the frame loop out of the
   * free-running branch, and stalling the very cycle that sent it.
   */
  const selfWritten = useRef<number | null>(null)

  // Installed in a LAYOUT effect, and before anything else registers.
  //
  // The ordering is load-bearing, not stylistic. `Lights` registers itself in a
  // layout effect too, and React runs every layout effect before any passive
  // one — so with this in a `useEffect` the lights announced themselves to a
  // listener that did not exist yet, were never written, and sat at three.js's
  // default white until some later transition happened to sweep over them. The
  // scene looked the same at every hour on load, which is a hard bug to see
  // precisely because the control still appeared to work.
  useLayoutEffect(() => {
    setRegistrationListener(() => {
      applyBlend(live.current, true)
      // oxlint-disable-next-line react/immutability -- three.js renderer state is mutable by design.
      gl.shadowMap.needsUpdate = true
      invalidate()
    })
    return () => setRegistrationListener(null)
  }, [gl, invalidate])

  // Register the scene handles, and install the background colour this driver
  // owns. `<color attach="background">` is gone from the tree precisely so
  // nothing else can replace this object out from under the sweep.
  useLayoutEffect(() => {
    const background = new THREE.Color()
    // oxlint-disable-next-line react/immutability -- the scene graph is mutable by design; this driver is its single owner for background and lighting.
    scene.background = background
    const release = registerScene({ scene, background })
    applyBlend(live.current, true)
    invalidate()
    return () => {
      release()
      // oxlint-disable-next-line react/immutability
      scene.background = null
    }
  }, [scene, invalidate])

  useLayoutEffect(() => {
    // Ignore the driver's own progress reports; see `selfWritten`.
    if (selfWritten.current !== null && hour === selfWritten.current) return

    // The opening state is applied, never animated: there is nothing on screen
    // yet to ease away from, and a multi-second fade-up on load would read as a
    // slow render rather than as a choice.
    //
    // A jump lands the same way, and for a related reason — see `hourJump`.
    // Clicking a dinner column asks for that meal's light, not for a tour of
    // the afternoon it would have to cross to get there.
    const instant = !mounted.current || prefersReducedMotion() || hourJump
    mounted.current = true

    const durationS = instant ? 0 : durationFor(forwardDistance(liveHour.current, hour))
    retargetHour(transition.current, liveHour.current, hour, durationS)

    if (instant) {
      liveHour.current = hour
      presetAt(hour, live.current)
      applyBlend(live.current, true)
      // oxlint-disable-next-line react/immutability -- three.js renderer state is mutable by design.
      gl.shadowMap.needsUpdate = true
    }
    shadowClock.current = 0
    invalidate()
  }, [hour, hourJump, gl, invalidate])

  // Kick the demand loop when cycling starts; without this the first frame
  // never arrives and the sky sits still with the switch on.
  useLayoutEffect(() => {
    auto.current = autoCycle
    if (autoCycle) invalidate()
  }, [autoCycle, invalidate])

  useFrame((_, delta) => {
    const t = transition.current
    const cycling = auto.current
    if (t.done && !cycling) return

    const dt = Math.min(delta, MAX_FRAME_DELTA_S)

    if (cycling && t.done) {
      // Free-running: the hour simply advances. No transition object is
      // involved, because there is no target to ease toward — which is also why
      // switching auto ON mid-sweep lets that sweep finish first.
      liveHour.current = normalizeHour(
        liveHour.current + timeOfDayConfig.autoCycle.hoursPerSecond * dt,
      )
      writeBackClock.current += dt
      if (writeBackClock.current >= STORE_WRITEBACK_S) {
        writeBackClock.current = 0
        const reported = Math.round(liveHour.current * 10) / 10
        selfWritten.current = reported
        useEnvironmentStore.getState().advanceHour(reported)
      }
    } else {
      liveHour.current = tickHour(t, dt)
    }

    presetAt(liveHour.current, live.current)
    // Forced on the last frame of a sweep, but never while cycling — the probe
    // would then rebuild every frame for a sky that has all day to get there.
    applyBlend(live.current, t.done && !cycling)

    shadowClock.current += dt
    if ((t.done && !cycling) || shadowClock.current >= SHADOW_REFRESH_S) {
      shadowClock.current = 0
      // oxlint-disable-next-line react/immutability -- three.js renderer state is mutable by design.
      gl.shadowMap.needsUpdate = true
    }

    invalidate()
  })

  return null
}
