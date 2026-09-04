import { buildingConfig, type BuildingConfig } from '@/config'
import type { FloorLayout, PillarMeta, Vec3 } from '@/types'
import { variationFor } from './variation'

/**
 * Pure instance-transform builders (no Three.js). The scene layer composes
 * these into InstancedMesh matrices. Shared unit geometries:
 *   - pillars/supports: unit-cross-section chamfered prism, base at y=0
 *     → scale = (width, height, width)
 *   - beams/nodes: unit cube centred at origin
 *     → scale = (width, height, length), rotY aligns the z-axis to the edge
 */

export interface InstanceTransform {
  position: Vec3
  scale: Vec3
  rotY: number
}

export interface PillarInstance {
  transform: InstanceTransform
  meta: PillarMeta
}

export interface PillarInstances {
  data: PillarInstance[]
  support: PillarInstance[]
}

export function buildPillarInstances(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): PillarInstances {
  const data: PillarInstance[] = []
  const support: PillarInstance[] = []

  for (const floor of floors) {
    const { pillarWidthFactor } = variationFor(floor.date, c)
    for (const p of floor.pillars) {
      const width = (p.isData ? c.pillarWidth : c.supportWidth) * pillarWidthFactor
      const instance: PillarInstance = {
        transform: {
          position: p.base,
          scale: { x: width, y: p.height, z: width },
          rotY: 0,
        },
        meta: p.meta,
      }
      ;(p.isData ? data : support).push(instance)
    }
  }
  return { data, support }
}

export interface DeckInstances {
  beams: InstanceTransform[]
  nodes: InstanceTransform[]
  /** floorIndex per beam/node, parallel arrays for metadata lookup. */
  beamFloor: number[]
  nodeFloor: number[]
}

/**
 * Flat triangular ring at each module base: three edge beams plus corner
 * node blocks covering the beam/pillar joints (plan §14).
 */
export function buildDeckInstances(
  floors: FloorLayout[],
  c: BuildingConfig = buildingConfig,
): DeckInstances {
  const beams: InstanceTransform[] = []
  const nodes: InstanceTransform[] = []
  const beamFloor: number[] = []
  const nodeFloor: number[] = []

  for (const floor of floors) {
    const y = floor.baseY + c.deckThickness / 2
    const corners = floor.pillars.map((p) => p.base)

    for (let i = 0; i < 3; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % 3]
      const dx = b.x - a.x
      const dz = b.z - a.z
      beams.push({
        position: { x: (a.x + b.x) / 2, y, z: (a.z + b.z) / 2 },
        scale: { x: c.deckBeamWidth, y: c.deckThickness, z: Math.hypot(dx, dz) },
        rotY: Math.atan2(dx, dz),
      })
      beamFloor.push(floor.floorIndex)

      // A slim collar, for the same reason the capital is: a wider one would
      // stand outside the plate the column is bolted to.
      const nodeSize = c.pillarWidth * 1.04
      nodes.push({
        position: { x: a.x, y, z: a.z },
        scale: { x: nodeSize, y: c.deckThickness, z: nodeSize },
        rotY: 0,
      })
      nodeFloor.push(floor.floorIndex)
    }
  }
  return { beams, nodes, beamFloor, nodeFloor }
}

