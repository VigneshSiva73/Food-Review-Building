import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useCursor } from '@react-three/drei'
import type * as THREE from 'three'
import { buildingConfig } from '@/config'
import { CORNER_MEALS } from '@/building'
import type { TooltipText } from '@/building/selection'
import type { PillarLayout } from '@/types'
import { currentSkyEnvironment } from './skyEnvironment'
import { currentEnvironmentIntensity } from './timeOfDay/applyBlend'
import { litMaterials, mealTints, pillarGeometry, sharedMaterials } from './resources'
import { noopRaycast } from './instancing'
import { PREVIEW_BOX_HEIGHT, type PreviewFraming } from './previewFraming'

/**
 * The small 3D diagrams in the side panel: the box, the light, and the one
 * axis of freedom they all share.
 *
 * A floor and a single column are the same picture at two scales, so they are
 * the same canvas with different things standing in it. Written twice they
 * drift — one gains a light or loses a degree of tilt — and the reader, who
 * looks at one directly after the other, sees the difference as a change in
 * the building rather than as a change in the drawing.
 */

/**
 * Point this canvas at the viewport's own sky probe.
 *
 * The glazing is nearly a mirror, so what it reflects IS its colour. Without
 * the same environment the panes here reflect nothing and come out black
 * beside the ones in the tower — the same trap the crown fell into. Read every
 * frame rather than held: the probe is rebuilt as the hour moves and the old
 * texture is disposed behind it.
 *
 * The intensity is the viewport's too, and for the same reason. It is a
 * time-of-day value the driver owns, and a fixed one here would make the two
 * glasses agree at one hour and disagree at every other.
 */
function BorrowedSky() {
  const scene = useThree((s) => s.scene)
  useFrame(() => {
    const env = currentSkyEnvironment()
    // oxlint-disable-next-line react/immutability -- the scene graph is mutable by design.
    if (scene.environment !== env) scene.environment = env
    const intensity = currentEnvironmentIntensity()
    // oxlint-disable-next-line react/immutability
    if (scene.environmentIntensity !== intensity) scene.environmentIntensity = intensity
  })
  return null
}

/**
 * Return the camera to the opening view whenever the subject changes.
 *
 * The canvas is not remounted between subjects — a WebGL context per plate
 * would be absurd — so without this the orbit the reader left on floor 12 is
 * the angle floor 13 opens at. Every subject should present itself the same
 * way first; spinning it afterwards is theirs to do.
 */
function OpeningView({
  position,
  target,
  nonce,
}: {
  position: [number, number, number]
  target: [number, number, number]
  /** Changes when the subject does. */
  nonce: string
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    camera.position.set(...position)
    if (controls) {
      controls.target.set(...target)
      controls.update()
    } else {
      camera.lookAt(...target)
    }
    invalidate()
    // Keyed on the subject alone. The framing numbers are derived from the
    // subject's own size, so they change with it and would re-trigger this
    // anyway — but naming the subject says what the reset is FOR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, camera, controls, invalidate])

  return null
}

/**
 * One column, wherever it stands.
 *
 * Shared by both diagrams: on the floor view it stands at its own corner of
 * the plan, and on the pillar view it stands at the origin on its own. Same
 * mesh, same concrete, same hover — a column that changed colour between the
 * two views would be read as a different column.
 */
export function PreviewPillar({
  pillar,
  corner,
  at,
  hovered,
  onHover,
  onPick,
}: {
  pillar: PillarLayout
  corner: 0 | 1 | 2
  /** Where its foot sits in this canvas. */
  at: [number, number, number]
  hovered: boolean
  onHover: (corner: 0 | 1 | 2 | null) => void
  onPick?: (corner: 0 | 1 | 2) => void
}) {
  const materials = sharedMaterials()
  const lit = litMaterials()

  /**
   * The meal's own concrete, as the tower mixes it.
   *
   * A clone rather than the shared material, because the tower carries this
   * tint per instance and there is no instancing here — three meshes, three
   * materials. Cloning keeps the colour arithmetic in one place (`mealTints`
   * is a ratio against the base) rather than restating it as a hex here.
   */
  const material = useMemo(() => {
    if (!pillar.isData) return materials.support
    const m = materials.structure.clone()
    m.color.multiply(mealTints()[CORNER_MEALS[corner]])
    return m
  }, [pillar.isData, corner, materials])

  const width = pillar.isData ? buildingConfig.pillarWidth : buildingConfig.supportWidth

  return (
    <>
      <mesh
        geometry={pillarGeometry()}
        material={material}
        position={at}
        scale={[width, pillar.height, width]}
        onPointerOver={(e) => {
          e.stopPropagation()
          onHover(corner)
        }}
        onPointerOut={() => onHover(null)}
        onClick={
          onPick &&
          ((e) => {
            e.stopPropagation()
            onPick(corner)
          })
        }
      />
      {hovered && (
        <mesh
          geometry={pillarGeometry()}
          // Through the glazing, and last. The same treatment the tower gives
          // a picked column, and needed more here: at this size a column half
          // hidden behind a pane is a column the reader cannot read.
          renderOrder={10}
          material={lit.hoverThrough}
          position={[at[0], at[1] - 0.02, at[2]]}
          scale={[width * 1.15, pillar.height + 0.04, width * 1.15]}
          raycast={noopRaycast}
        />
      )}
    </>
  )
}

/**
 * The panel's diagram box: one subject, level light, and a turntable.
 *
 * The tooltip is the caller's text rather than the caller's element, so both
 * diagrams place it the same way — beside the pointer, inside the panel, and
 * outside the box that crops the canvas to its rounded corners.
 */
export function PreviewShell({
  framing,
  nonce,
  tooltip,
  onLeave,
  /**
   * Drawn over the canvas, inside the same clipped box.
   *
   * For annotation rather than for scenery: rules and type that belong to the
   * drawing but not to the model. Inert to the pointer, so the thing it
   * annotates is still the thing the cursor finds.
   */
  overlay,
  children,
}: {
  framing: PreviewFraming
  nonce: string
  tooltip: TooltipText | null
  onLeave: () => void
  overlay?: ReactNode
  children: ReactNode
}) {
  const [at, setAt] = useState({ x: 0, y: 0 })
  // The same signal the viewport gives: something under the cursor you can
  // point at, so the cursor says so.
  useCursor(tooltip !== null)

  return (
    // The label sits OUTSIDE the clipping box: that box crops the canvas to
    // its rounded corners, and a label near an edge would be cropped with it.
    <div
      className="relative"
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        setAt({ x: e.clientX - box.left, y: e.clientY - box.top })
      }}
      onPointerLeave={onLeave}
    >
      <div
        className="relative overflow-hidden rounded-lg border border-surface-700/70 bg-surface-900/60"
        style={{ height: PREVIEW_BOX_HEIGHT }}
      >
        <Canvas
          // On demand, like the main viewport: a still diagram should not hold
          // a second animation loop open beside the one drawing the city.
          frameloop="demand"
          dpr={[1, 2]}
          camera={framing.camera}
          gl={{ antialias: true, alpha: true }}
        >
          <BorrowedSky />
          <ambientLight intensity={1.1} />
          <hemisphereLight args={['#cfe0f5', '#3b3a38', 1.2]} />
          <directionalLight position={[1, 2.2, 1.4]} intensity={2.4} />
          {children}
          <OpeningView position={framing.eye} target={framing.target} nonce={nonce} />
          {/*
            Turntable only: the subject spins, the eye stays put. A plate seen
            from below is a soffit and from directly above is a triangle, and
            neither is what this panel is for — the reader wants to walk round
            the storey and see which column is which, which is one axis of
            freedom, not two. Pinning the polar angle to the opening view's own
            is what says that.
          */}
          <OrbitControls
            makeDefault
            target={framing.target}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={framing.polar}
            maxPolarAngle={framing.polar}
          />
        </Canvas>
        {overlay && (
          <div className="pointer-events-none absolute inset-0">{overlay}</div>
        )}
      </div>

      {tooltip && (
        <div
          // `top-0 left-0` is not decoration: without it an absolutely placed
          // element keeps its STATIC position — under the canvas, at the end of
          // the flow — and the transform below moves it from there, so the
          // label appears a canvas-height away from the pointer.
          className="pointer-events-none absolute top-0 left-0 z-10 max-w-[12rem] rounded-md border border-surface-700 bg-surface-900/95 px-2 py-1 shadow-lg"
          // Flipped to the left near the right edge, so the label never leaves
          // the panel it belongs to.
          style={{
            transform: `translate3d(${at.x > 150 ? at.x - 140 : at.x + 12}px, ${at.y + 12}px, 0)`,
          }}
        >
          <p className="text-[11px] font-medium text-ink-100">{tooltip.title}</p>
          <p className="text-[10px] text-ink-500">{tooltip.subtitle}</p>
        </div>
      )}
    </div>
  )
}
