/**
 * Registry of everything that moves.
 *
 * `AnimationDriver` owns the only `useFrame` in the environment; traffic,
 * pedestrians, signals, drifting clouds and twinkling stars all register a tick
 * here instead of each opening their own frame loop. One loop means one clock,
 * one `invalidate` per frame, and one place that decides whether the world is
 * moving at all.
 *
 * It lived under `city/` and was named for it, which stopped being true once
 * the sky started moving too — and the driver had to leave that folder anyway,
 * since the auto-cycle has to keep running with the city switched off.
 *
 * Module-scoped like `scene/resources.ts`: there is a single canvas, and a
 * context would add a provider for no gain.
 */

/** `dtS` is the clamped frame delta in seconds; `elapsedMs` the world clock. */
export type FrameTick = (dtS: number, elapsedMs: number) => void

const systems = new Set<FrameTick>()

/** Register a system. Returns the unsubscribe, for use as an effect cleanup. */
export function registerFrameSystem(tick: FrameTick): () => void {
  systems.add(tick)
  return () => {
    systems.delete(tick)
  }
}

export function tickFrameSystems(dtS: number, elapsedMs: number): void {
  for (const tick of systems) tick(dtS, elapsedMs)
}

/** Number of registered systems. Exposed for tests. */
export function frameSystemCount(): number {
  return systems.size
}
