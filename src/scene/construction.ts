import type * as THREE from 'three'
import type { FloorProgress } from '@/building/timeline'
import type { AnyTransform } from './instancing'

/**
 * Registry connecting the Building's GPU objects to the ConstructionAnimator
 * (plan §29). Geometry is revealed with instance counts and draw ranges —
 * both O(1) — so the intro never rebuilds buffers; only growing pillars have
 * their matrices rewritten, and only while they are in motion.
 */

export type BuildPhase = keyof FloorProgress

export interface InstancedRegistration {
  mesh: THREE.InstancedMesh
  transforms: AnyTransform[]
  /** Instances are emitted floor-by-floor, so this is ascending. */
  prefix: number[]
  /** floorIndex per instance, for per-instance growth progress. */
  floorOf: number[]
  phase: BuildPhase
  /** Pillars grow vertically; everything else simply appears. */
  grows: boolean
}

export interface RangedRegistration {
  geometry: THREE.BufferGeometry
  vertsPerFloor: number
  phase: BuildPhase
}

export interface ConstructionRegistry {
  instanced: Map<string, InstancedRegistration>
  ranged: Map<string, RangedRegistration>
}

export function createRegistry(): ConstructionRegistry {
  return { instanced: new Map(), ranged: new Map() }
}

/**
 * prefix[f] = number of instances belonging to floors strictly below f.
 * Lets the animator turn "N floors revealed" into an instance count in O(1).
 */
export function buildPrefix(floorOf: number[], floorCount: number): number[] {
  const prefix = new Array<number>(floorCount + 1).fill(0)
  for (const f of floorOf) {
    if (f + 1 <= floorCount) prefix[f + 1]++
  }
  for (let i = 1; i <= floorCount; i++) prefix[i] += prefix[i - 1]
  return prefix
}
