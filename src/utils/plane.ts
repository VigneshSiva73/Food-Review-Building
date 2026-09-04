import type { Vec3 } from '@/types'

/** Cross product a × b. */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v)
  if (len === 0) return { x: 0, y: 1, z: 0 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/**
 * Unit normal of the plane through three points, oriented upward (y > 0).
 * Three points always define exactly one plane — the geometric fact that
 * makes the tilted slab exact rather than warped (plan §15).
 */
export function planeNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const n = normalize(cross(sub(b, a), sub(c, a)))
  return n.y < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n
}
