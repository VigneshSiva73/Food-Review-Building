import { describe, expect, it } from 'vitest'
import { buildingConfig } from '@/config'
import {
  PREVIEW_BOX_HEIGHT,
  previewFraming,
  previewProjectY,
  previewScale,
} from './previewFraming'

describe('previewFraming', () => {
  it('looks straight at the subject, not down on it', () => {
    // A storey seen from above is the top of its plate, which is the one
    // surface of a floor that carries nothing. Exactly level, not nearly so:
    // a degree of tilt reads as a mistake precisely because it is almost
    // straight, which is what measuring the eye from the target fixes.
    const { eye, target, polar } = previewFraming(100, 18)
    expect(eye[1]).toBe(target[1])
    expect(eye[0]).toBe(0)
    expect(polar).toBeCloseTo(Math.PI / 2, 12)
  })

  it('sits back by the distance it is given', () => {
    const { eye, camera } = previewFraming(100, 18)
    expect(eye[2]).toBeCloseTo(100, 12)
    expect(camera.position).toBe(eye)
    // The far plane follows the distance, so a wider frame cannot clip its own
    // subject away.
    expect(camera.far).toBeGreaterThan(100)
  })

  it('raises its aim without moving back', () => {
    // Where the eye points and how far away it stands are independent, which
    // is what lets a pillar be centred in its box without being rescaled.
    const low = previewFraming(100, 9)
    const high = previewFraming(100, 18)
    expect(high.target[1]).toBeGreaterThan(low.target[1])
    expect(high.eye[2]).toBe(low.eye[2])
    expect(high.polar).toBeCloseTo(low.polar, 12)
  })

  it('centres two pillars of different heights without rescaling them', () => {
    // The rule the pillar view depends on, in both halves. The DISTANCE is
    // sized to the tallest a pillar can be rather than to the one in front of
    // it, so a two-star breakfast is drawn visibly shorter than a five-star
    // dinner instead of both filling the box — the one mistake a diagram of a
    // single bar can make. The AIM then follows each column's own middle, so
    // neither of them hangs in the bottom of the frame.
    const { pillarHeightMin, pillarHeightMax } = buildingConfig
    const distance = pillarHeightMax * 2
    const shortest = previewFraming(distance, pillarHeightMin / 2)
    const tallest = previewFraming(distance, pillarHeightMax / 2)

    // Same scale: the eye is the same distance back for both.
    expect(shortest.eye[2]).toBe(tallest.eye[2])
    expect(pillarHeightMin).toBeLessThan(pillarHeightMax)

    // Centred: each column's middle is exactly what the camera looks at, so
    // it stands with equal air above and below it.
    const halfSpan = distance * Math.tan((32 / 2) * (Math.PI / 180))
    for (const [frame, height] of [
      [shortest, pillarHeightMin],
      [tallest, pillarHeightMax],
    ] as const) {
      expect(frame.target[1]).toBeCloseTo(height / 2, 12)
      // And it fits, top and foot alike.
      expect(frame.target[1] + halfSpan).toBeGreaterThan(height)
      expect(frame.target[1] - halfSpan).toBeLessThan(0)
    }
  })
})

describe('previewProjectY', () => {
  const { pillarHeightMin, pillarHeightMax } = buildingConfig
  const frameFor = (height: number) => previewFraming(pillarHeightMax * 2, height / 2)

  it('puts what the camera aims at in the middle of the box', () => {
    const frame = frameFor(pillarHeightMax)
    expect(previewProjectY(frame, frame.target[1])).toBeCloseTo(PREVIEW_BOX_HEIGHT / 2, 9)
  })

  it('measures downward, in pixels per world unit', () => {
    // Higher in the world is nearer the top of the box, and the two ends of a
    // column are exactly its height apart on screen. The dimension line is
    // drawn off these two numbers, so a sign error here would draw it upside
    // down.
    const frame = frameFor(pillarHeightMax)
    const perUnit = previewScale(frame)
    expect(perUnit).toBeGreaterThan(0)
    expect(previewProjectY(frame, pillarHeightMax)).toBeLessThan(previewProjectY(frame, 0))
    expect(previewProjectY(frame, 0) - previewProjectY(frame, pillarHeightMax)).toBeCloseTo(
      pillarHeightMax * perUnit,
      9,
    )
  })

  it('keeps both ends of any column inside the box it is drawn on', () => {
    // What the dimension line depends on: an extension line off a foot below
    // the frame, or an arrowhead above its top, is clipped away by the box.
    for (const height of [pillarHeightMin, (pillarHeightMin + pillarHeightMax) / 2, pillarHeightMax]) {
      const frame = frameFor(height)
      const top = previewProjectY(frame, height)
      const foot = previewProjectY(frame, 0)
      expect(top).toBeGreaterThan(0)
      expect(foot).toBeLessThan(PREVIEW_BOX_HEIGHT)
      // Centred: as much air above the column as below it.
      expect(top).toBeCloseTo(PREVIEW_BOX_HEIGHT - foot, 9)
    }
  })

  it('draws a short column shorter than a tall one', () => {
    // The point of the fixed distance, restated in pixels — which is what the
    // reader actually sees.
    const short = frameFor(pillarHeightMin)
    const tall = frameFor(pillarHeightMax)
    const span = (f: ReturnType<typeof frameFor>, h: number) =>
      previewProjectY(f, 0) - previewProjectY(f, h)
    expect(span(short, pillarHeightMin)).toBeLessThan(span(tall, pillarHeightMax))
    // At the same scale, so the difference is the rating and nothing else.
    expect(previewScale(short)).toBeCloseTo(previewScale(tall), 9)
  })
})
