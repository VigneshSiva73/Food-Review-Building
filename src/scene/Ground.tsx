import { materialsConfig } from '@/config'
import { noopRaycast } from './instancing'

interface GroundProps {
  /** Content radius; the plane extends well beyond it. */
  boundingRadius: number
  /** Distance at which the haze is fully opaque. */
  fadeDistance: number
}

/**
 * Shadow-receiving ground plane.
 *
 * Sized past the fog rather than past the building. A plane scaled only to the
 * content ends inside the visible range and its edge reads as a hard line —
 * the tower on a floating platform. Running it beyond the point where the haze
 * has fully closed in means the ground never visibly stops; it just dissolves
 * into the backdrop, which is the same reason the fog colour and the
 * background are one colour.
 */
export function Ground({ boundingRadius, fadeDistance }: GroundProps) {
  const size = Math.max(boundingRadius * 12, fadeDistance * 2.5)
  const g = materialsConfig.ground
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
      raycast={noopRaycast}
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color={g.color} roughness={g.roughness} metalness={g.metalness} />
    </mesh>
  )
}
