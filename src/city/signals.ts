import { cityConfig, type CityConfig } from '@/config'
import type { SignalPhase, SignalPost } from './types'

/**
 * Where the signal heads stand (plan §22).
 *
 * One post on each of a junction's four corners, so whichever way a driver or
 * a walker is facing there is an aspect in view. All four show that junction's
 * single state, because that is genuinely what the model does: the whole
 * junction is held or released together, and the traffic and the pedestrians
 * have been obeying exactly this one number since they were built. Giving each
 * approach its own phase would be a different simulation, not a different
 * decoration.
 *
 * Posts sit at the outer edge of the footway rather than on its centreline,
 * which is where the pedestrian circuits run — a signal standing in the middle
 * of the pavement would have walkers filing straight through it.
 */
export function buildSignalPosts(
  signals: SignalPhase[],
  c: CityConfig = cityConfig,
): SignalPost[] {
  const offset = c.roads.mainHalfWidth + c.roads.sidewalkWidth - c.signals.postInset
  const out: SignalPost[] = []

  for (let i = 0; i < signals.length; i++) {
    const { center } = signals[i]
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        out.push({
          id: `signal-post-${i}-${sx > 0 ? 'p' : 'n'}${sz > 0 ? 'p' : 'n'}`,
          position: { x: center.x + sx * offset, z: center.z + sz * offset },
          baseY: c.roads.curbHeight,
          // Face back at the junction: the post is on a corner, so that is a
          // diagonal, which is also how a corner-mounted head is really aimed.
          rotationY: Math.atan2(-sx, -sz),
          signal: i,
        })
      }
    }
  }
  return out
}
