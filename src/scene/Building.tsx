import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import { buildingConfig, MEAL_HOURS, slabOverhang } from '@/config'
import type { FloorLayout, PillarLayout } from '@/types'
import type { SelectionRef } from '@/types/selection'
import { CORNER_MEALS } from '@/building'
import {
  buildCapitalInstances,
  buildFasciaInstances,
  buildGlassGeometry,
  glassVertsPerFloor,
  buildMullionInstances,
  buildSoffitRibInstances,
} from '@/building/facade'
import {
  buildDeckInstances,
  buildPillarInstances,
  type PillarInstance,
} from '@/building/matrices'
import { buildSlabGeometry, slabVertsPerFloor } from '@/building/slabGeometry'
import { variationFor } from '@/building/variation'
import { useAnimationStore } from '@/state/useAnimationStore'
import { useEnvironmentStore } from '@/state/useEnvironmentStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import {
  buildPrefix,
  createRegistry,
  type BuildPhase,
  type ConstructionRegistry,
} from './construction'
import { ConstructionAnimator } from './ConstructionAnimator'
import { noopRaycast, raycastFor, writeInstances, type AnyTransform } from './instancing'
import {
  crownGeometry,
  crownLightGeometry,
  crownMullionGeometry,
  crownRibGeometry,
  crownRibPart,
  litMaterials,
  helipadGeometry,
  heroLayerGeometry,
  mealTints,
  pillarGeometry,
  podiumGeometry,
  sharedMaterials,
} from './resources'

interface PointerHandlers {
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

interface RegistryProps {
  registry: RefObject<ConstructionRegistry>
  floorCount: number
}

function InstancedGroup({
  transforms,
  floorOf,
  colors,
  geometry,
  material,
  name,
  phase,
  grows = false,
  interactive = false,
  handlers,
  registry,
  floorCount,
}: RegistryProps & {
  transforms: AnyTransform[]
  /** floorIndex per instance; instances are emitted floor-by-floor. */
  floorOf: number[]
  /** Optional per-instance tint, index-parallel with `transforms`. */
  colors?: THREE.Color[]
  geometry: THREE.BufferGeometry
  material: THREE.Material
  name: string
  phase: BuildPhase
  grows?: boolean
  interactive?: boolean
  handlers?: PointerHandlers
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    writeInstances(mesh, transforms)
    // Written once here and never again: the construction animator rewrites
    // matrices every frame of the intro but never touches colours, so these
    // survive the reveal and the day-slider untouched.
    if (colors) {
      for (let i = 0; i < colors.length; i++) mesh.setColorAt(i, colors[i])
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    const store = registry.current.instanced
    store.set(name, {
      mesh,
      transforms,
      floorOf,
      prefix: buildPrefix(floorOf, floorCount),
      phase,
      grows,
    })
    return () => {
      store.delete(name)
    }
  }, [transforms, floorOf, colors, name, phase, grows, registry, floorCount])

  if (transforms.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, transforms.length]}
      castShadow
      receiveShadow
      raycast={raycastFor('instanced', interactive)}
      {...handlers}
    />
  )
}

/** Resolve a hit on a merged, floor-tagged geometry back to its floor. */
function faceFloorRef(
  geometry: THREE.BufferGeometry,
  faceIndex: number | null | undefined,
): SelectionRef | null {
  if (faceIndex === null || faceIndex === undefined) return null
  const attr = geometry.getAttribute('floorIndex')
  if (!attr) return null
  return { kind: 'floor', floorIndex: attr.getX(faceIndex * 3) }
}

/** Resolve a hit on the merged rib buffer back to the meal that rib carries. */
function faceCornerRef(
  geometry: THREE.BufferGeometry,
  faceIndex: number | null | undefined,
): SelectionRef | null {
  if (faceIndex === null || faceIndex === undefined) return null
  const attr = geometry.getAttribute('corner')
  if (!attr) return null
  return { kind: 'meal', corner: attr.getX(faceIndex * 3) as 0 | 1 | 2 }
}

function SlabMesh({
  floors,
  interactive,
  registry,
  floorCount,
}: RegistryProps & { floors: FloorLayout[]; interactive: boolean }) {
  const materials = sharedMaterials()
  const setHovered = useSelectionStore((s) => s.setHovered)
  const select = useSelectionStore((s) => s.select)

  const geometry = useMemo(() => {
    const data = buildSlabGeometry(floors)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geom.setAttribute('floorIndex', new THREE.BufferAttribute(data.floorIndex, 1))
    geom.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
    // The slab material has `vertexColors` on, so this attribute is not
    // optional: without it every plate renders black.
    geom.setAttribute('color', new THREE.BufferAttribute(data.shade, 3))
    geom.computeVertexNormals()
    return geom
  }, [floors])

  // Dispose replaced geometry (dataset reloads) — plan §32.
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const store = registry.current.ranged
    store.set('slabs', { geometry, vertsPerFloor: slabVertsPerFloor(), phase: 'slab' })
    return () => {
      store.delete('slabs')
    }
  }, [geometry, registry, floorCount])

  if (floors.length === 0) return null
  return (
    <mesh
      name="slabs"
      geometry={geometry}
      material={materials.slab}
      castShadow
      receiveShadow
      raycast={raycastFor('mesh', interactive)}
      onPointerMove={(e) => {
        e.stopPropagation()
        setHovered(faceFloorRef(geometry, e.faceIndex))
      }}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        e.stopPropagation()
        select(faceFloorRef(geometry, e.faceIndex))
      }}
    />
  )
}

/**
 * Smoked glazing inside each day's open storey.
 *
 * A second ranged mesh registered on the `slab` phase, so a floor's glass is
 * revealed with the plate that caps it — during the construction intro and
 * under the day slider alike.
 *
 * Pickable, and it has to be. It was not, on the reasoning that a transparent
 * surface in front of the structure would steal clicks meant for the columns
 * behind it. Two things have since made that backwards: the glazing is opaque
 * and sits on the plate edge, so it IS the elevation rather than a film over
 * it, and hovering a floor now lights that storey — so the glass is both the
 * largest target a floor has and the thing that visibly responds. Leaving it
 * inert meant the plate, a thin lid, was the only way to light a floor.
 *
 * The columns do not lose out. They stand at the corners where the outline is
 * unglazed, so a ray aimed at an exposed column face passes between the two
 * corner returns and reaches it.
 */
function GlassMesh({
  floors,
  interactive,
  registry,
  floorCount,
}: RegistryProps & { floors: FloorLayout[]; interactive: boolean }) {
  const materials = sharedMaterials()
  const setHovered = useSelectionStore((s) => s.setHovered)
  const select = useSelectionStore((s) => s.select)

  const geometry = useMemo(() => {
    const data = buildGlassGeometry(floors)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geom.setAttribute('color', new THREE.BufferAttribute(data.tint, 3))
    // Curtain-wall UVs: `u` along each elevation, `v` the floor. Without them
    // the glazing had no coordinates at all, so a lit-window map was
    // impossible and any emissive lit the whole facade at once.
    geom.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
    // Not decoration: this is what lets a ray hitting a pane resolve to the
    // floor that pane belongs to. The builder has always written it; nothing
    // read it until the glazing became pickable.
    geom.setAttribute('floorIndex', new THREE.BufferAttribute(data.floorIndex, 1))
    geom.computeVertexNormals()
    return geom
  }, [floors])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const store = registry.current.ranged
    store.set('glass', { geometry, vertsPerFloor: glassVertsPerFloor(), phase: 'slab' })
    return () => {
      store.delete('glass')
    }
  }, [geometry, registry, floorCount])

  if (floors.length === 0) return null
  return (
    <mesh
      name="glass"
      geometry={geometry}
      material={materials.glass}
      raycast={raycastFor('mesh', interactive)}
      onPointerMove={(e) => {
        e.stopPropagation()
        setHovered(faceFloorRef(geometry, e.faceIndex))
      }}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        e.stopPropagation()
        select(faceFloorRef(geometry, e.faceIndex))
      }}
    />
  )
}

function Podium() {
  const materials = sharedMaterials()
  return (
    <mesh
      name="podium"
      geometry={podiumGeometry()}
      material={materials.structure}
      scale={[1, buildingConfig.podiumHeight, 1]}
      castShadow
      receiveShadow
      raycast={noopRaycast}
    />
  )
}

/**
 * Marks the hovered/selected object (plan §27).
 *
 * Everything lights up: a pillar, a floor, one meal's column, the whole tower.
 * That is the building's own vocabulary for "this one" — a tower of dark glass
 * gives it for free — and using one signal for every scale means the only
 * thing that changes between them is how much of the building answers.
 */
function SelectionHighlight({
  floors,
  maxVisibleFloors,
}: {
  floors: FloorLayout[]
  maxVisibleFloors: number
}) {
  const hovered = useSelectionStore((s) => s.hovered)
  const selected = useSelectionStore((s) => s.selected)
  const lit = litMaterials()

  /**
   * One material for every kind of highlight, and it is the LIT one.
   *
   * A picked column used to take an amber accent instead, on the reasoning
   * that a member being picked out is a UI statement and should look like one.
   * That is now the odd one out: a floor, a meal's column and the whole tower
   * all light up, so a column that turned gold instead read as a different
   * event rather than as the same event on a smaller object.
   */
  const overlays = [
    {
      ref: selected,
      light: lit.selected,
      plate: lit.selectedPlate,
      through: lit.selectedThrough,
      key: 'selected',
    },
    {
      ref: hovered,
      light: lit.hover,
      plate: lit.hoverPlate,
      through: lit.hoverThrough,
      key: 'hover',
    },
  ]

  return (
    <>
      {overlays.map(({ ref, light, plate, through, key }) => {
        if (!ref) return null
        if (ref.kind === 'pillar') {
          const floor = floors[ref.floorIndex]
          const pillar = floor?.pillars[ref.corner]
          if (!pillar) return null
          const width =
            (pillar.isData ? buildingConfig.pillarWidth : buildingConfig.supportWidth) * 1.15
          return (
            <group key={key}>
              <mesh
                geometry={pillarGeometry()}
                // Drawn through whatever is in front of it. A column is exposed
                // at the triangle's corners and buried behind opaque glazing
                // along every elevation, so a highlight that stops at the glass
                // shows a third of the member — which reads as the render being
                // broken rather than as the column being picked.
                material={through}
                renderOrder={HIGHLIGHT_RENDER_ORDER}
                position={[pillar.base.x, pillar.base.y - 0.02, pillar.base.z]}
                scale={[width, pillar.height + 0.04, width]}
                raycast={noopRaycast}
              />
              <PlateOccluders floors={floors} maxVisibleFloors={maxVisibleFloors} />
            </group>
          )
        }
        // Pointing at the crown lights every COLUMN in the tower, the crown's
        // own three included. Columns are what the building is made of — one
        // per meal per day, and the thing every rating is measured on — so
        // lighting all of them is what "this whole object" looks like here.
        // Lighting the glazing instead says "these storeys", which is the
        // floor signal repeated, not a building one.
        if (ref.kind === 'building') {
          return (
            <BuildingOverlay
              key={key}
              floors={floors}
              maxVisibleFloors={maxVisibleFloors}
              material={light}
              plateMaterial={plate}
            />
          )
        }
        // One rib stands over one column, and that column carries one meal on
        // every floor of the month. Pointing at the rib lights the whole run
        // of it — which is the only way the building can say "this meal, all
        // month" rather than "this meal, that day".
        if (ref.kind === 'meal') {
          return (
            <MealOverlay
              key={key}
              floors={floors}
              maxVisibleFloors={maxVisibleFloors}
              corner={ref.corner}
              material={light}
            />
          )
        }
        const floor = floors[ref.floorIndex]
        if (!floor) return null
        return <FloorOverlay key={key} floor={floor} material={plate} />
      })}
    </>
  )
}

/**
 * Where the see-through highlights sit in the draw order.
 *
 * They ignore the depth test, so what they end up in front of is decided by
 * when they are drawn and by nothing else. Last.
 */
const HIGHLIGHT_RENDER_ORDER = 10

/**
 * The plates, drawn a second time on top of the see-through column.
 *
 * "Through the glass but not through the floors" is not something a depth test
 * can express on its own: the depth buffer records how far away a surface is,
 * not what kind of surface it was, so a highlight that ignores depth ignores
 * the plates and the glazing alike and the column ends up slicing through
 * every storey between it and the camera.
 *
 * So the plates are simply drawn again, after it. Where a plate is genuinely
 * the nearest thing it passes its own depth test and repaints itself over the
 * highlight; where the column is nearer, or where only glass stands between,
 * the plate is behind and fails, and the highlight survives. One re-draw of a
 * mesh that is already built, and only while a column is picked.
 *
 * It uses the real plate material rather than a copy, so it carries the hour's
 * own light with it — a copy would be a second writer on values the
 * time-of-day driver owns, and would sit unlit at night.
 */
function PlateOccluders({
  floors,
  maxVisibleFloors,
}: {
  floors: FloorLayout[]
  maxVisibleFloors: number
}) {
  const materials = sharedMaterials()
  const shown = Math.min(floors.length, maxVisibleFloors)
  const visible = useMemo(() => floors.slice(0, shown), [floors, shown])

  const geometry = useMemo(() => {
    const data = buildSlabGeometry(visible)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2))
    // The plate material reads vertex colours; without this it renders black.
    geom.setAttribute('color', new THREE.BufferAttribute(data.shade, 3))
    geom.computeVertexNormals()
    return geom
  }, [visible])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  if (visible.length === 0) return null
  return (
    <mesh
      geometry={geometry}
      material={materials.slab}
      renderOrder={HIGHLIGHT_RENDER_ORDER + 1}
      raycast={noopRaycast}
    />
  )
}

/** How far a plate's highlight shell rides above the plate it covers. */
const SLAB_LIFT = 0.06

/**
 * How far a column's shell stands outside the plate's corner wrap.
 *
 * Enough to clear it on a TILTED plate, not just a level one: the wrap is an
 * arc in the plate's own plane, so its reach measured horizontally grows as
 * the day's ratings spread the plate. A quarter of a unit covered the level
 * case and left the steepest plates still cutting a ring.
 */
const SHELL_PROUD = 0.45

/**
 * The lit shell over one real column, run the whole height of its module.
 *
 * From the module's base datum to the next one, NOT from the base of the shaft
 * to the top of it. A column's shaft stops under the plate it carries, and
 * above it sit the capital, the plate and the band that absorbs the day's
 * height — so a shell cut to the shaft leaves a dark collar at every floor
 * line and a lit run up the building comes out dashed. Continuous is the whole
 * point of lighting a column: it is one member from the ground to the point.
 *
 * The width is measured from the PLATE, not from the column, and that is the
 * other half of making the run continuous. The plate wraps each column on an
 * arc of `slabOverhang` about its centreline, so a shell sized as a fraction
 * of the column sits just inside that arc — and every plate in the building
 * then draws a dark ring across the lit column at its own floor line. Standing
 * the shell a little outside the arc puts it in front of the plate at the
 * corner, which is the one place the plate and the column meet in view.
 *
 * It swallows the collar on the way: the deck node and the capital sit at 1.04
 * and 1.05 of the column, well inside this.
 */
function columnShell(floor: FloorLayout, pillar: PillarLayout): AnyTransform {
  const section = pillar.isData ? buildingConfig.pillarWidth : buildingConfig.supportWidth
  const width = Math.max(section * 1.15, (slabOverhang() + SHELL_PROUD) * 2)
  return {
    position: { x: pillar.base.x, y: pillar.base.y - 0.02, z: pillar.base.z },
    scale: { x: width, y: floor.deckY - pillar.base.y + 0.04, z: width },
    rotY: 0,
  }
}

/**
 * One meal's column, lit from the ground to the point.
 *
 * Every floor's pillar at that corner plus the crown rib above them, which is
 * the same member carried past the last plate. The plates are deliberately NOT
 * lit here: a plate belongs to a day and carries all three meals, so washing
 * it would say "these days" when what is being pointed at is one meal.
 */
function MealOverlay({
  floors,
  maxVisibleFloors,
  corner,
  material,
}: {
  floors: FloorLayout[]
  maxVisibleFloors: number
  corner: 0 | 1 | 2
  material: THREE.Material
}) {
  const shellRef = useRef<THREE.InstancedMesh>(null)
  const shown = Math.min(floors.length, maxVisibleFloors)

  const transforms = useMemo(
    () => floors.slice(0, shown).map((floor) => columnShell(floor, floor.pillars[corner])),
    [floors, shown, corner],
  )

  useLayoutEffect(() => {
    if (shellRef.current) writeInstances(shellRef.current, transforms)
  }, [transforms])

  const anchor = roofAnchor(floors, maxVisibleFloors)
  if (transforms.length === 0) return null
  return (
    <>
      <instancedMesh
        ref={shellRef}
        args={[pillarGeometry(), material, transforms.length]}
        raycast={noopRaycast}
      />
      {anchor && (
        <mesh
          geometry={crownRibPart(corner)}
          material={material}
          position={[anchor.x, anchor.y + buildingConfig.crown.lift, anchor.z]}
          scale={CROWN_SHELL_SCALE}
          raycast={noopRaycast}
        />
      )}
    </>
  )
}

/**
 * Every column and every plate in the tower, lit at once — the crown's three
 * ribs included.
 *
 * One instanced shell over the columns and one merged mesh over the plates,
 * rather than a mesh each: a month is seventy-five columns and twenty-five
 * plates, and the app holds a hard draw-call budget.
 *
 * Capped by the day slider, because the columns above it are not on screen and
 * a highlight standing where a hidden storey would be reads as a ghost of the
 * building rather than as the building.
 */
function BuildingOverlay({
  floors,
  maxVisibleFloors,
  material,
  plateMaterial,
}: {
  floors: FloorLayout[]
  maxVisibleFloors: number
  material: THREE.Material
  /** Biased forward, because a plate shell lies on the plate it covers. */
  plateMaterial: THREE.Material
}) {
  const shellRef = useRef<THREE.InstancedMesh>(null)
  const shown = Math.min(floors.length, maxVisibleFloors)

  const transforms = useMemo(() => {
    return floors
      .slice(0, shown)
      .flatMap((floor) => floor.pillars.map((pillar) => columnShell(floor, pillar)))
  }, [floors, shown])

  useLayoutEffect(() => {
    if (shellRef.current) writeInstances(shellRef.current, transforms)
  }, [transforms])

  const visible = useMemo(() => floors.slice(0, shown), [floors, shown])
  const plates = usePlateShell(visible)

  const top = shown > 0 ? floors[shown - 1] : undefined
  const anchor = roofAnchor(floors, maxVisibleFloors)

  if (transforms.length === 0 || !top) return null
  return (
    <>
      <instancedMesh
        ref={shellRef}
        args={[pillarGeometry(), material, transforms.length]}
        raycast={noopRaycast}
      />
      <mesh geometry={plates} material={plateMaterial} raycast={noopRaycast} />
      {/*
        The spire's own ribs, which ARE the columns above the last plate — so
        they light with them or the tower stops halfway up.
      */}
      {anchor && (
        <mesh
          geometry={crownRibGeometry()}
          material={material}
          position={[anchor.x, anchor.y + buildingConfig.crown.lift, anchor.z]}
          scale={CROWN_SHELL_SCALE}
          raycast={noopRaycast}
        />
      )}
    </>
  )
}

/**
 * How far the crown's highlight shell stands off its ribs.
 *
 * A shade over one, and it has to be: the shell and the rib are the same
 * geometry, so at exactly one they are coplanar everywhere and the pair
 * z-fights up the whole spire.
 */
const CROWN_SHELL_SCALE = 1.012

/**
 * A shell over some plates, lifted clear of the ones it covers.
 *
 * Lifted rather than inflated: a plate is a tilted wedge, and scaling one about
 * its own centre walks its edge off the columns it sits on. Raising the set by
 * a fraction of the plate's thickness separates the shell from the real plate
 * everywhere without moving it anywhere it does not belong — the underside
 * ends up buried inside the slab where nothing can see it, so the top face and
 * the edges are the only parts on show.
 */
function usePlateShell(floors: FloorLayout[]): THREE.BufferGeometry {
  const geometry = useMemo(() => {
    const data = buildSlabGeometry(floors)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geom.translate(0, SLAB_LIFT, 0)
    geom.computeVertexNormals()
    return geom
  }, [floors])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

/**
 * One storey, lit — as its PLATE.
 *
 * It was the storey's glazing for a long time, on the reasoning that concrete
 * does not light up when the lights inside do and a band of glass going bright
 * is what reads as an occupied floor. That is a good argument about occupancy
 * and the wrong one for this: a floor here is a DAY, and the plate is the part
 * of a day you can see from every angle — one per day, stacked, the thing the
 * whole tower is read by. Lighting the glass instead lit the gap between two
 * days rather than the day itself.
 */
function FloorOverlay({ floor, material }: { floor: FloorLayout; material: THREE.Material }) {
  const floors = useMemo(() => [floor], [floor])
  return <mesh geometry={usePlateShell(floors)} material={material} raycast={noopRaycast} />
}

/**
 * Where a rooftop fitting stands: the centre of the topmost plate on show.
 *
 * It follows the day slider rather than the dataset, because the plate the
 * slider stops on is the roof from the viewer's point of view, and anything
 * hanging in the air above it would read as a bug.
 */
function roofAnchor(
  floors: FloorLayout[],
  maxVisibleFloors: number,
): { x: number; y: number; z: number } | null {
  const shown = Math.min(floors.length, maxVisibleFloors)
  const floor = shown > 0 ? floors[shown - 1] : undefined
  if (!floor) return null
  const centre = floor.pillars.reduce(
    (acc, p) => ({ x: acc.x + p.base.x / 3, z: acc.z + p.base.z / 3 }),
    { x: 0, z: 0 },
  )
  return { x: centre.x, y: floor.deckY, z: centre.z }
}

/**
 * Painted helipad on the flat top of the highest plate on show.
 *
 * Hidden while the construction intro runs: during the reveal there is no
 * settled roof for it to sit on.
 */
function Helipad({
  floors,
  maxVisibleFloors,
}: {
  floors: FloorLayout[]
  maxVisibleFloors: number
}) {
  const materials = sharedMaterials()
  const anchor = roofAnchor(floors, maxVisibleFloors)
  if (!anchor) return null
  return (
    <mesh
      name="helipad"
      geometry={helipadGeometry()}
      material={materials.helipad}
      position={[anchor.x, anchor.y + buildingConfig.helipad.lift, anchor.z]}
      // No shadows either way. The sun's map is rendered once and frozen, and
      // this mesh moves whenever the day slider does — anything it cast or
      // received would be left over from the roof it used to sit on.
      raycast={noopRaycast}
    />
  )
}

/**
 * Glass spire crowning a month whose reviews are finished.
 *
 * A month is topped out when its records run to its last working day; the
 * newest month in the dataset does not, because those meals have not been
 * eaten yet. So the crown is a state you can read from across the city — a
 * flat-topped tower is a month still being collected, a spire is a month
 * closed. Nothing else in the building says that.
 *
 * It takes the helipad's place instead of standing beside it. The two share
 * one roof and the spire covers all of it, so they cannot both be there: a
 * helipad under a glass pyramid is not a helipad.
 *
 * No shadows, for the helipad's reason — the sun's map is frozen and these
 * meshes move with the day slider.
 */
function Crown({
  floors,
  maxVisibleFloors,
  interactive,
}: {
  floors: FloorLayout[]
  maxVisibleFloors: number
  interactive: boolean
}) {
  const materials = sharedMaterials()
  const setHovered = useSelectionStore((s) => s.setHovered)
  const select = useSelectionStore((s) => s.select)
  const jumpToHour = useEnvironmentStore((s) => s.jumpToHour)
  const anchor = roofAnchor(floors, maxVisibleFloors)
  if (!anchor) return null

  /**
   * The crown answers for the whole building.
   *
   * Every other pickable surface here resolves to a day or a meal, because
   * that is what a plate and a column ARE. The crown is not a part in that
   * sense — it is the building's end, and it only exists on a month that is
   * finished — so pointing at it asks about the month rather than about
   * anything in it.
   *
   * Hover only, deliberately: it lights the tower and reports beside the
   * cursor, and leaves the selection where it was. A click that replaced a
   * chosen meal with "the whole month" would lose the reader's place for a
   * summary they can already see by pointing.
   */
  const handlers = interactive
    ? {
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHovered({ kind: 'building' })
        },
        onPointerOut: () => setHovered(null),
        /**
         * And clicking it selects the month, which is the only object in the
         * scene that is not a part of the building. Pointing at the crown asks
         * "what is this month"; clicking it makes the panel answer at length
         * and keeps the answer up while the pointer goes elsewhere.
         */
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          select({ kind: 'building' })
        },
      }
    : {}

  /**
   * A rib is a meal, all the way down.
   *
   * Each of the three leans over the column it caps, so pointing at one asks
   * about that meal across the whole month — the tower answers by lighting
   * that column on every floor. Clicking makes the panel answer at length, and
   * takes the scene to the hour the meal is eaten at, exactly as clicking one
   * of its columns does: a rib IS the column, seen from the top of the
   * building instead of from beside it.
   */
  const ribHandlers = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setHovered(faceCornerRef(crownRibGeometry(), e.faceIndex))
    },
    onPointerOut: () => setHovered(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      const ref = faceCornerRef(crownRibGeometry(), e.faceIndex)
      select(ref)
      if (ref?.kind === 'meal') jumpToHour(MEAL_HOURS[CORNER_MEALS[ref.corner]])
    },
  }

  return (
    <group name="crown" position={[anchor.x, anchor.y + buildingConfig.crown.lift, anchor.z]}>
      <mesh
        name="crown-glass"
        geometry={crownGeometry()}
        material={materials.crown}
        raycast={raycastFor('mesh', interactive)}
        {...handlers}
      />
      <mesh
        name="crown-ribs"
        geometry={crownRibGeometry()}
        // The same light concrete as the columns, because that is what these
        // are: the columns' line carried past the last plate to the point.
        material={materials.structure}
        // And they answer for their OWN meal rather than for the building: a
        // rib continues one column, so pointing at it asks about that column's
        // month. Which rib was hit is read from the merged buffer's `corner`
        // attribute, the same trick the plates use for their floor — three
        // meshes here would be three draw calls for one spire.
        raycast={raycastFor('mesh', interactive)}
        {...(interactive ? ribHandlers : {})}
      />
      <mesh
        name="crown-lights"
        geometry={crownLightGeometry()}
        // Unlit, so a beacon does not take shading from a sun that is not
        // shining on it — the same material shape the city's street lamps use.
        material={materials.crownLight}
        raycast={noopRaycast}
      />
      <mesh
        name="crown-mullions"
        geometry={crownMullionGeometry()}
        // The facade's own dark steel, so the spire's grain and the tower's
        // are the same grain.
        material={materials.support}
        raycast={noopRaycast}
      />
    </group>
  )
}

/**
 * The data-driven building: instanced pillars/supports/deck framing, merged
 * tilted-slab mesh, facade, and leave bands. Consumes solver output only —
 * never raw CSV. Raycasting touches exactly three mesh groups (pillars,
 * supports, slabs) plus leave bands; everything else opts out (plan §28) and
 * all picking pauses while the construction intro runs.
 */
export function Building({
  floors,
  showMullions = false,
  showCrown = false,
  maxVisibleFloors = Infinity,
}: {
  floors: FloorLayout[]
  /** The densest layer; disabled by default on mobile-class devices. */
  showMullions?: boolean
  /** The month's reviews run to its end, so the tower is topped out. */
  showCrown?: boolean
  /** Day-slider cap: reveal only the first N floors (plan: slicer). */
  maxVisibleFloors?: number
}) {
  const materials = sharedMaterials()
  const setHovered = useSelectionStore((s) => s.setHovered)
  const select = useSelectionStore((s) => s.select)
  const hovered = useSelectionStore((s) => s.hovered)
  const jumpToHour = useEnvironmentStore((s) => s.jumpToHour)
  const constructing = useAnimationStore((s) => s.phase) === 'running'
  useCursor(hovered !== null)

  const registry = useRef<ConstructionRegistry>(createRegistry())
  const floorCount = floors.length
  const shared = { registry, floorCount }

  const pillars = useMemo(() => buildPillarInstances(floors), [floors])
  const deck = useMemo(() => buildDeckInstances(floors), [floors])
  const fascias = useMemo(() => buildFasciaInstances(floors), [floors])
  const capitals = useMemo(() => buildCapitalInstances(floors), [floors])
  const ribs = useMemo(() => buildSoffitRibInstances(floors), [floors])
  const fins = useMemo(() => buildMullionInstances(floors), [floors])

  const pillarTransforms = useMemo(
    () => pillars.data.map((p) => p.transform),
    [pillars],
  )
  const pillarFloors = useMemo(() => pillars.data.map((p) => p.meta.floorIndex), [pillars])
  /**
   * Per-pillar concrete tone: the meal's identity tint, scaled by that day's
   * seeded pour shade. Data pillars only — the supports are dark steel, whose
   * whole job is to say "no review here", and tinting them would blunt it.
   */
  const pillarColors = useMemo(() => {
    const tints = mealTints()
    return pillars.data.map((p) => {
      const floor = floors[p.meta.floorIndex]
      const shade = floor ? variationFor(floor.date).concreteShade : 1
      return tints[p.meta.mealType].clone().multiplyScalar(shade)
    })
  }, [pillars, floors])
  const supportTransforms = useMemo(
    () => pillars.support.map((p) => p.transform),
    [pillars],
  )
  const supportFloors = useMemo(() => pillars.support.map((p) => p.meta.floorIndex), [pillars])
  const pillarRef = (list: PillarInstance[], instanceId: number | undefined): SelectionRef | null => {
    if (instanceId === undefined) return null
    const meta = list[instanceId]?.meta
    if (!meta) return null
    return {
      kind: 'pillar',
      floorIndex: meta.floorIndex,
      corner: CORNER_MEALS.indexOf(meta.mealType) as 0 | 1 | 2,
    }
  }

  const pillarHandlers = (list: PillarInstance[]): PointerHandlers => ({
    onPointerMove: (e) => {
      e.stopPropagation()
      setHovered(pillarRef(list, e.instanceId))
    },
    onPointerOut: () => setHovered(null),
    onClick: (e) => {
      e.stopPropagation()
      const ref = pillarRef(list, e.instanceId)
      select(ref)
      /**
       * And take the scene to the hour that meal is eaten at.
       *
       * The one thing this building can say that a chart cannot: a breakfast
       * rating is a morning reading, and looking at it after dark is looking
       * at it out of its own light. Clicking the column is the natural place
       * to say it, because the column IS the meal.
       *
       * Only from a click in the scene. The same selection arrives from the
       * keyboard and from the stats links, and those are ways of reading the
       * data rather than of standing in front of it — moving the sun under
       * someone stepping through floors with the arrow keys would be weather,
       * not a response.
       *
       * And it JUMPS. The time control sweeps, because there the hour is the
       * subject and watching it pass is the point; here it is the answer, and
       * crossing the afternoon to reach the night is a delay in front of it.
       */
      if (ref?.kind === 'pillar') jumpToHour(MEAL_HOURS[CORNER_MEALS[ref.corner]])
    },
  })

  /** Any structural piece of a floor selects that whole day. */
  const floorHandlers = (floorOf: number[]): PointerHandlers => {
    const refAt = (instanceId: number | undefined): SelectionRef | null => {
      if (instanceId === undefined) return null
      const floorIndex = floorOf[instanceId]
      return floorIndex === undefined ? null : { kind: 'floor', floorIndex }
    }
    return {
      onPointerMove: (e) => {
        e.stopPropagation()
        setHovered(refAt(e.instanceId))
      },
      onPointerOut: () => setHovered(null),
      onClick: (e) => {
        e.stopPropagation()
        select(refAt(e.instanceId))
      },
    }
  }

  return (
    <group>
      <InstancedGroup
        {...shared}
        name="pillars"
        transforms={pillarTransforms}
        floorOf={pillarFloors}
        colors={pillarColors}
        geometry={heroLayerGeometry.pillars()}
        material={materials.structure}
        phase="pillar"
        grows
        interactive={!constructing}
        handlers={pillarHandlers(pillars.data)}
      />
      <InstancedGroup
        {...shared}
        name="supports"
        transforms={supportTransforms}
        floorOf={supportFloors}
        geometry={heroLayerGeometry.supports()}
        material={materials.support}
        phase="pillar"
        grows
        interactive={!constructing}
        handlers={pillarHandlers(pillars.support)}
      />
      <InstancedGroup
        {...shared}
        name="deckNodes"
        transforms={deck.nodes}
        floorOf={deck.nodeFloor}
        geometry={heroLayerGeometry.deckNodes()}
        // Corner nodes are part of the column, not a floor edge. In the same
        // light concrete they disappear into the shaft; in dark fascia they
        // sliced every column into a ladder of blocks.
        material={materials.structure}
        phase="pillar"
        interactive={!constructing}
        handlers={floorHandlers(deck.nodeFloor)}
      />
      <InstancedGroup
        {...shared}
        name="fascias"
        transforms={fascias.transforms}
        floorOf={fascias.floorOf}
        geometry={heroLayerGeometry.fascias()}
        material={materials.fascia}
        phase="slab"
        interactive={!constructing}
        handlers={floorHandlers(fascias.floorOf)}
      />
      <InstancedGroup
        {...shared}
        name="soffitRibs"
        transforms={ribs.transforms}
        floorOf={ribs.floorOf}
        geometry={heroLayerGeometry.soffitRibs()}
        // Concrete, so these read as part of the plate they hang from — and
        // pointedly NOT the `slab` material, which has `vertexColors` on since
        // the plates gained their baked shading. A unit box has no colour
        // attribute, so sharing that material would render every rib black.
        material={materials.structure}
        phase="slab"
        // Not pickable. Selection stays on the groups that already had it, so
        // the pointer contract is exactly what it was.
        interactive={false}
      />
      {showMullions && (
        <InstancedGroup
          {...shared}
          name="mullionFins"
          transforms={fins.transforms}
          floorOf={fins.floorOf}
          geometry={heroLayerGeometry.mullionFins()}
          material={materials.support}
          phase="slab"
          // The densest layer in the building and the first thing the quality
          // tier switches off. Gated by the viewport's details toggle, which
          // had been inert since the old clerestory fins were removed.
          interactive={false}
        />
      )}
      <InstancedGroup
        {...shared}
        name="capitals"
        transforms={capitals.transforms}
        floorOf={capitals.floorOf}
        geometry={heroLayerGeometry.capitals()}
        material={materials.fascia}
        phase="slab"
      />
      <SlabMesh {...shared} floors={floors} interactive={!constructing} />
      <GlassMesh {...shared} floors={floors} interactive={!constructing} />
      <Podium />
      {!constructing &&
        (showCrown ? (
          <Crown
            floors={floors}
            maxVisibleFloors={maxVisibleFloors}
            interactive={!constructing}
          />
        ) : (
          <Helipad floors={floors} maxVisibleFloors={maxVisibleFloors} />
        ))}
      <SelectionHighlight floors={floors} maxVisibleFloors={maxVisibleFloors} />
      <ConstructionAnimator
        registry={registry}
        floorCount={floorCount}
        maxVisibleFloors={maxVisibleFloors}
        contentKey={floors}
      />
    </group>
  )
}
