import type * as THREE from 'three'

/**
 * Azimuth and elevation to a unit direction.
 *
 * Its own module rather than living beside the dome, because two very separate
 * pieces of arithmetic have to agree on it: this places the sun and moon DISCS
 * in the sky, while `sunPositionFromAngles` places the LIGHT. If they ever
 * disagree the scene shows a sun in one place lighting the city from another,
 * which reads as wrong long before anyone works out why — so a test pins them
 * against each other, and that test needs somewhere to import this from that is
 * not a React component.
 */
export function dirFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevationDeg * Math.PI) / 180
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize()
}
