import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CORNER_MEALS, footprintRadius } from '@/building'
import { buildGlassGeometry, buildMullionInstances } from '@/building/facade'
import { buildSlabGeometry } from '@/building/slabGeometry'
import { tooltipText } from '@/building/selection'
import { MEAL_HOURS } from '@/config'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import type { FloorLayout } from '@/types'
import { isWebGLAvailable } from '@/utils/webgl'
import { PreviewPillar, PreviewShell } from './PreviewCanvas'
import { useFraming } from './previewFraming'
import { sharedMaterials, unitBoxGeometry } from './resources'
import { noopRaycast, writeInstances } from './instancing'

/**
 * One floor, on its own, in the side panel.
 *
 * The storey as it is built — plate, glazing and all three columns — turned so
 * one view carries the whole plan. The glass is opaque, so two of the columns
 * stand behind it from any one angle; a hovered column is therefore drawn
 * THROUGH it, exactly as the main viewport draws a picked one, or the panel
 * would answer half the pointer's questions with a pane.
 *
 * Hover is this canvas's own; a CLICK is the app's. Sharing the hover state
 * would light the pillar in the main viewport too — which sounds helpful until
 * the cursor tooltip out there appears at wherever the pointer last was in the
 * viewport and sits still, because it only tracks pointer moves over its own
 * host.
 *
 * A click is the opposite case, and it does everything the viewport's own
 * pillar click does: it selects, so the panel follows down to that pillar, and
 * it takes the scene to the hour that meal is eaten at — breakfast to day,
 * lunch to the afternoon, dinner to night. This canvas is the same building at
 * a smaller size rather than a diagram of it, so a column here answers to the
 * pointer exactly as the one out there does. Leaving the hour behind was tried
 * and was wrong: it made two columns that stand for the same meal behave
 * differently depending on which window they were clicked in.
 */

/** How far back the eye sits, in footprint radii. */
const REACH = 2.35

/**
 * The fins on the glazing — the vertical grain the whole tower is read by.
 *
 * Instanced, as they are in the tower: a storey carries a few dozen of them
 * and a mesh each would cost more draw calls than the rest of this canvas put
 * together. Inert to the pointer for the glazing's reason — a fin standing in
 * front of a column must not intercept a ray meant for it.
 */
function Mullions({ floor }: { floor: FloorLayout }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const materials = sharedMaterials()
  const fins = useMemo(() => buildMullionInstances([floor]).transforms, [floor])

  useLayoutEffect(() => {
    if (ref.current) writeInstances(ref.current, fins)
  }, [fins])

  if (fins.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[unitBoxGeometry(), materials.support, fins.length]}
      raycast={noopRaycast}
    />
  )
}

function FloorModel({
  floor,
  hovered,
  onHover,
  onPick,
}: {
  floor: FloorLayout
  hovered: 0 | 1 | 2 | null
  onHover: (corner: 0 | 1 | 2 | null) => void
  onPick: (corner: 0 | 1 | 2) => void
}) {
  const materials = sharedMaterials()

  /**
   * The facade's glazing, lit rather than mirrored.
   *
   * The tower's panes are metalness 0.9, which means they have no colour of
   * their own — every pixel of them is a reflection. That works out there
   * because there is a whole world to reflect: sky above the horizon, city
   * below it, sun somewhere in between. In here there is a sky probe and three
   * lamps, so the lower half of every reflection is the probe's unlit ground
   * and the panes come out blotched with black.
   *
   * Turning the metal down was not enough, because it left the reflection in
   * charge of some of the pixels and those were still the black ones. So this
   * takes it out of the equation: a dielectric with its own tone, lit by the
   * lamps in this canvas, which cannot be patchy because nothing patchy is
   * lighting it. The roughness comes up with it — a mirror-smooth dielectric
   * would trade the black patches for a white highlight, which is the same
   * fault the other way round.
   *
   * The emissive map goes too. It is authored per storey of a whole tower, and
   * a clone freezes whatever intensity the hour happened to be at when it was
   * made; a diagram of one floor is better with no windows lit than with the
   * wrong ones lit for ever.
   */
  const glassMaterial = useMemo(() => {
    const m = materials.glass.clone()
    m.metalness = 0.08
    m.roughness = 0.3
    m.envMapIntensity = 0.8
    m.emissiveMap = null
    m.emissiveIntensity = 0
    return m
  }, [materials])

  useEffect(() => () => glassMaterial.dispose(), [glassMaterial])

  const glass = useMemo(() => {
    const data = buildGlassGeometry([floor])
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    // The glazing material reads both: a per-floor tint, and curtain-wall UVs
    // for the lit-window map. Without them it renders black by day and stripes
    // itself after dark.
    geom.setAttribute('color', new THREE.BufferAttribute(data.tint, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
    geom.computeVertexNormals()
    return geom
  }, [floor])

  const plate = useMemo(() => {
    const data = buildSlabGeometry([floor])
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
    // The plate material reads vertex colours; without this it renders black.
    geom.setAttribute('color', new THREE.BufferAttribute(data.shade, 3))
    geom.computeVertexNormals()
    return geom
  }, [floor])

  useEffect(
    () => () => {
      glass.dispose()
      plate.dispose()
    },
    [glass, plate],
  )

  // The module sits wherever its storey does — a thousand units up, in the
  // tower's own coordinates. Brought back to the origin so one fixed camera
  // frames the fifth floor and the twenty-fifth alike.
  const centre = floor.pillars.reduce(
    (acc, p) => ({ x: acc.x + p.base.x / 3, z: acc.z + p.base.z / 3 }),
    { x: 0, z: 0 },
  )

  return (
    <group position={[-centre.x, -floor.baseY, -centre.z]}>
      <mesh geometry={plate} material={materials.slab} raycast={noopRaycast} />
      {/*
        Inert to the pointer, so a ray aimed at a column passes through the pane
        in front of it and finds the column. The glass is what the storey looks
        like; the columns are what it means.
      */}
      <mesh geometry={glass} material={glassMaterial} raycast={noopRaycast} />
      <Mullions floor={floor} />
      {([0, 1, 2] as const).map((corner) => (
        <PreviewPillar
          key={corner}
          pillar={floor.pillars[corner]}
          corner={corner}
          at={[
            floor.pillars[corner].base.x,
            floor.pillars[corner].base.y,
            floor.pillars[corner].base.z,
          ]}
          hovered={hovered === corner}
          onHover={onHover}
          onPick={onPick}
        />
      ))}
    </group>
  )
}

export function FloorPreview({ floor }: { floor: FloorLayout }) {
  const [hovered, setHovered] = useState<0 | 1 | 2 | null>(null)
  const select = useSelectionStore((s) => s.select)
  const jumpToHour = useEnvironmentStore((s) => s.jumpToHour)
  const webgl = useMemo(() => isWebGLAvailable(), [])

  // Just below the module's middle: a storey is read at the columns rather
  // than at the plate they carry, so the eye sits in the glazed volume.
  const rise = floor.deckY - floor.baseY
  const framing = useFraming(footprintRadius() * REACH, rise * 0.45)

  const tooltip =
    hovered === null
      ? null
      : tooltipText({ kind: 'pillar', floor, pillar: floor.pillars[hovered] })

  // No canvas where there is no WebGL — the app already shows a designed
  // fallback for that, and a second dead rectangle is not an improvement.
  if (!webgl) return null

  return (
    <PreviewShell
      framing={framing}
      nonce={floor.date}
      tooltip={tooltip}
      onLeave={() => setHovered(null)}
    >
      <FloorModel
        floor={floor}
        hovered={hovered}
        onHover={setHovered}
        onPick={(corner) => {
          select({ kind: 'pillar', floorIndex: floor.floorIndex, corner })
          // And it JUMPS, as the viewport's does. The time control sweeps,
          // because there the hour is the subject and watching it pass is the
          // point; here it is the answer, and crossing the afternoon to reach
          // the night is a delay in front of it.
          jumpToHour(MEAL_HOURS[CORNER_MEALS[corner]])
        }}
      />
    </PreviewShell>
  )
}
