import { useMemo } from 'react'

/**
 * How the side panel's small canvases frame their subject.
 *
 * Shared by the floor view and the pillar view so the two open the same way —
 * same eye height, same level look, same turntable axis. They are read one
 * after the other, a floor and then one of its columns, and a diagram that
 * re-aims itself between the two makes the reader re-orient rather than
 * compare.
 */

/**
 * Level, not raised. Looking down on a storey shows the top of its plate,
 * which is the one surface of a floor that carries nothing — the ratings are
 * in the height of the columns and in the tilt of the plate, and both of those
 * are read from the side. A straight view also puts all three elevations at
 * the same foreshortening, so turning the floor compares like with like.
 */
export const PREVIEW_PITCH_DEG = 0

/**
 * The diagram box's height in CSS pixels.
 *
 * A number rather than a Tailwind class because the pillar view's dimension
 * line is drawn in pixels over the canvas, and its arithmetic needs the same
 * height the box actually has. Two places that must agree, one of which is a
 * class name, is a pair that silently stops agreeing.
 */
export const PREVIEW_BOX_HEIGHT = 176

export interface PreviewFraming {
  eye: [number, number, number]
  target: [number, number, number]
  /** The opening view's polar angle, which is also the axis the turntable pins. */
  polar: number
  camera: { position: [number, number, number]; fov: number; near: number; far: number }
}

/**
 * A fixed opening view: standing `distance` back, looking at height `aim`.
 *
 * The two are deliberately independent, and for a single column that
 * separation is the whole design. The DISTANCE is the scale — hold it constant
 * across every pillar and a two-star breakfast is drawn shorter than a
 * five-star dinner, where a frame fitted to each one would draw them as the
 * same picture. The AIM is only where in that frame the subject sits, so it
 * can follow the column's own middle and centre it without touching the scale
 * the reader is comparing against.
 *
 * Pure, and separate from the hook, so the geometry is unit-tested without a
 * renderer — the same rule the layout solver follows.
 */
export function previewFraming(distance: number, aim: number): PreviewFraming {
  const pitch = (PREVIEW_PITCH_DEG * Math.PI) / 180
  const target: [number, number, number] = [0, aim, 0]
  // Measured FROM the target, so a pitch of zero is exactly level rather than
  // nearly so. Adding the rise separately left a degree or two of downward
  // tilt that read as a mistake precisely because it was almost straight.
  const eye: [number, number, number] = [
    0,
    target[1] + distance * Math.sin(pitch),
    distance * Math.cos(pitch),
  ]
  return {
    eye,
    target,
    /**
     * Measured from the framing rather than written down beside it: the two
     * are the same number, and a literal here would drift the moment the pitch
     * or the subject's height changed, tilting the model on its first frame.
     */
    polar: Math.atan2(eye[2], eye[1] - target[1]),
    camera: { position: eye, fov: 32, near: 1, far: distance * 6 },
  }
}

/**
 * The same framing, held still between renders.
 *
 * One object per (distance, aim): the camera props and the orbit target are
 * applied by identity, so a fresh object every render would re-aim the
 * controls under a reader who is mid-drag.
 */
export function useFraming(distance: number, aim: number): PreviewFraming {
  return useMemo(() => previewFraming(distance, aim), [distance, aim])
}

/**
 * Where a height in the world lands on the canvas, in pixels from its top.
 *
 * Exact, and it stays exact while the reader turns the model: the eye is level
 * and the subject stands on the axis it rotates about, so a vertical distance
 * at the centre of the frame projects the same way at every angle. That is
 * what lets the pillar view draw its dimension line in SVG over the canvas
 * instead of as geometry inside it — crisp rules and real type, at a size
 * where a 3D label would be a smear.
 */
export function previewProjectY(framing: PreviewFraming, worldY: number): number {
  const halfSpan = framing.eye[2] * Math.tan(((framing.camera.fov / 2) * Math.PI) / 180)
  const perUnit = PREVIEW_BOX_HEIGHT / 2 / halfSpan
  return PREVIEW_BOX_HEIGHT / 2 - (worldY - framing.target[1]) * perUnit
}

/** How many pixels one world unit spans, at the frame's centre. */
export function previewScale(framing: PreviewFraming): number {
  return previewProjectY(framing, 0) - previewProjectY(framing, 1)
}
