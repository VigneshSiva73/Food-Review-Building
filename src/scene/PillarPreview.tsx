import { useMemo, useState } from 'react'
import { buildingConfig, MEAL_HOURS } from '@/config'
import { CORNER_MEALS } from '@/building'
import { tooltipText } from '@/building/selection'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import type { FloorLayout } from '@/types'
import { isWebGLAvailable } from '@/utils/webgl'
import { PreviewPillar, PreviewShell } from './PreviewCanvas'
import { PREVIEW_BOX_HEIGHT, previewProjectY, previewScale, useFraming } from './previewFraming'
import type { PreviewFraming } from './previewFraming'

/**
 * One column, on its own, in the side panel.
 *
 * The narrowest of the panel's diagrams, and the same canvas as the floor's:
 * same box, same light, same turntable. What it drops is everything the column
 * does not say. A pillar's rating is its HEIGHT, and beside a plate and two
 * neighbours that is one reading among several; alone in a frame it is the
 * only thing there is to look at.
 *
 * Which is why the frame does not fit the column. It is sized once, to the
 * tallest a pillar can be, so every pillar view shares one scale and a short
 * column looks short — a camera that framed its subject would draw a two-star
 * breakfast and a five-star dinner as the same picture, which is the one
 * mistake a diagram of a single bar can make.
 */

/**
 * Far enough back that the tallest column clears the frame with air above it.
 *
 * In heights, not in units, so the tuning survives the next time the tower is
 * rescaled — which has happened four times, and every literal distance in the
 * project has had to be found and changed on each of them.
 */
const REACH = 2

/**
 * The column's height, dimensioned as a drawing would dimension it.
 *
 * A pillar's height IS its rating — that is the whole encoding the tower runs
 * on — and a bar with nothing beside it can only be read against other bars.
 * So the rating is put back on the drawing the way a machinist would put a
 * length on it: extension lines off the two ends, an arrowed dimension line
 * between them, and the figure called out beside it.
 *
 * Drawn in SVG over the canvas rather than as geometry inside it. The eye is
 * level and the column stands on the axis the turntable rotates about, so its
 * height projects identically at every angle — which means flat pixels are not
 * an approximation here, they are exact, and they buy hairlines and real type
 * at a size where 3D text would be a smear.
 *
 * Nothing is drawn for a column that carries no rating. A support post has a
 * height, but it is the minimum the solver gives an empty corner rather than a
 * measurement of anything, and dimensioning it would state a figure the data
 * never recorded.
 */
const ARROW = 4

function Dimension({ framing, height, rating }: {
  framing: PreviewFraming
  height: number
  rating: number
}) {
  const top = previewProjectY(framing, height)
  const foot = previewProjectY(framing, 0)
  const perUnit = previewScale(framing)
  // Clear of the column itself, by its own half-width plus a hair of air —
  // measured rather than guessed, so the line stays clear of a wider section.
  const gap = (buildingConfig.pillarWidth / 2) * perUnit + 4
  const line = gap + 22
  const mid = (top + foot) / 2

  return (
    <svg
      className="absolute top-0 left-1/2 overflow-visible text-ink-300"
      width={140}
      // Anchored at the frame's centre line, which is the column's own axis:
      // x = 0 here is the middle of the column, and every offset below is
      // measured off it.
      height={PREVIEW_BOX_HEIGHT}
    >
      {/* Extension lines: off the ends of the feature, past the dimension. */}
      {[top, foot].map((y) => (
        <line
          key={y}
          x1={gap}
          y1={y}
          x2={line + 6}
          y2={y}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.7}
        />
      ))}
      {/* The dimension line, arrowed at both ends. */}
      <line x1={line} y1={top} x2={line} y2={foot} stroke="currentColor" strokeWidth={1} />
      <polygon points={`${line},${top} ${line - ARROW},${top + ARROW * 2} ${line + ARROW},${top + ARROW * 2}`} fill="currentColor" />
      <polygon points={`${line},${foot} ${line - ARROW},${foot - ARROW * 2} ${line + ARROW},${foot - ARROW * 2}`} fill="currentColor" />
      {/*
        The figure beside the line rather than broken into it. A vertical
        dimension is normally set turned through ninety degrees, which reads
        well on a drawing the size of a desk and not at all in a box this
        small — and the number is the one thing here that must be read.
      */}
      <text
        x={line + 8}
        y={mid - 1}
        className="fill-ink-100 tnum"
        fontSize={12}
        fontWeight={600}
      >
        {rating.toFixed(3)}
      </text>
      <text x={line + 8} y={mid + 10} className="fill-ink-500" fontSize={8} letterSpacing={0.8}>
        RATING
      </text>
    </svg>
  )
}

export function PillarPreview({ floor, corner }: { floor: FloorLayout; corner: 0 | 1 | 2 }) {
  const [hovered, setHovered] = useState(false)
  const jumpToHour = useEnvironmentStore((s) => s.jumpToHour)
  const webgl = useMemo(() => isWebGLAvailable(), [])
  const pillar = floor.pillars[corner]

  /**
   * Scale from the tallest column there can be; aim at the middle of THIS one.
   *
   * The distance is what the reader compares heights against, so it is a
   * constant — fitted to each column, every rating would fill the box and the
   * one thing a pillar says would be lost. Where the eye points costs nothing
   * of that: a short column aimed at the tall frame's centre hangs in the
   * bottom of the box with an empty sky above it, and centring it puts it
   * where the reader is already looking without changing its size by a pixel.
   */
  const framing = useFraming(buildingConfig.pillarHeightMax * REACH, pillar.height / 2)

  const tooltip = hovered ? tooltipText({ kind: 'pillar', floor, pillar }) : null

  if (!webgl) return null

  return (
    <PreviewShell
      framing={framing}
      // Both halves: the same corner on two different floors is two different
      // pillars, and the view has to reopen for each of them.
      nonce={`${floor.date}:${corner}`}
      tooltip={tooltip}
      onLeave={() => setHovered(false)}
      overlay={
        pillar.meta.rating === undefined ? null : (
          <Dimension framing={framing} height={pillar.height} rating={pillar.meta.rating} />
        )
      }
    >
      {/*
        Stood at the origin rather than at its corner of the plan. There is no
        plan here to stand in, and off-centre it would swing round the empty
        middle as the turntable turned.
      */}
      <PreviewPillar
        pillar={pillar}
        corner={corner}
        at={[0, 0, 0]}
        hovered={hovered}
        onHover={(c) => setHovered(c !== null)}
        // Already the selected pillar, so the click has only the hour left to
        // say — and it still says it. A column stands for a meal wherever it
        // is drawn, and clicking one takes the scene to when that meal is
        // eaten; a column that did nothing here would be the only one in the
        // app that did not.
        onPick={() => jumpToHour(MEAL_HOURS[CORNER_MEALS[corner]])}
      />
    </PreviewShell>
  )
}
