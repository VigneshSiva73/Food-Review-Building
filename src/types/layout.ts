/**
 * Building-layout models emitted by the pure layout solver.
 * Deliberately Three.js-free so the solver stays unit-testable;
 * the scene layer converts Vec3 to THREE.Vector3 at upload time.
 */

import type { MealType } from './domain'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Metadata attached to every raycastable object, traceable to source rows. */
export interface PillarMeta {
  date: string
  mealType: MealType
  rating?: number
  vendor?: string
  floorIndex: number
  /** false → Saturday/missing-data support post, carries no rating. */
  isData: boolean
}

export interface PillarLayout {
  mealType: MealType
  /** 0 = Breakfast (front-left), 1 = Lunch (front-right), 2 = Dinner (rear). */
  corner: 0 | 1 | 2
  base: Vec3
  height: number
  isData: boolean
  meta: PillarMeta
}

export interface SlabLayout {
  /**
   * Underside contact points (= pillar tops), ordered [Breakfast, Lunch,
   * Dinner]. The plate extrudes upward from these along `normal` by
   * `thickness`.
   */
  corners: [Vec3, Vec3, Vec3]
  /** Unit normal of the slab plane (points upward). */
  normal: Vec3
  thickness: number
}

export interface FloorLayout {
  date: string
  floorIndex: number
  /** Elevation of this module's flat base deck. */
  baseY: number
  /** Elevation of the flat datum carrying the next module. */
  deckY: number
  pillars: [PillarLayout, PillarLayout, PillarLayout]
  slab: SlabLayout
  availableMeals: MealType[]
}

export interface BuildingLayout {
  floors: FloorLayout[]
  totalHeight: number
  /** Horizontal bounding radius of the footprint, for camera fitting. */
  radius: number
}
