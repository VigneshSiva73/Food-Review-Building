import * as THREE from 'three'
import type { AlignedTransform } from '@/building/facade'
import type { InstanceTransform } from '@/building/matrices'

export type AnyTransform = InstanceTransform | AlignedTransform

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)
const tmpMatrix = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpDir = new THREE.Vector3()
const tmpUp = new THREE.Vector3()
const tmpSide = new THREE.Vector3()
const tmpBasis = new THREE.Matrix4()

/**
 * Compose one instance matrix. `yFactor` scales the vertical extent only —
 * the construction animation uses it to grow pillars from their base, since
 * every shared prism geometry has its origin at the base.
 *
 * Aligned transforms come in two flavours. With `align` alone the rotation is
 * the minimal one from +z, which leaves the roll about that axis unspecified —
 * fine for a square section, wrong for a profiled one. Supplying `up` pins the
 * third degree of freedom by building the basis explicitly.
 */
export function composeInstance(t: AnyTransform, yFactor = 1): THREE.Matrix4 {
  tmpPos.set(t.position.x, t.position.y, t.position.z)
  tmpScale.set(t.scale.x, t.scale.y * yFactor, t.scale.z)
  if ('align' in t) {
    tmpDir.set(t.align.x, t.align.y, t.align.z).normalize()
    if (t.up) {
      // Gram-Schmidt: keep the beam axis exactly, and take the component of
      // the requested up that is perpendicular to it. A caller handing over a
      // slab normal gets a beam whose top face lies in the slab plane.
      tmpUp.set(t.up.x, t.up.y, t.up.z)
      tmpUp.addScaledVector(tmpDir, -tmpUp.dot(tmpDir))
      if (tmpUp.lengthSq() < 1e-12) {
        // Degenerate: `up` was parallel to the beam. Any perpendicular will do,
        // and falling back keeps one bad input from producing a NaN matrix.
        tmpQuat.setFromUnitVectors(Z_AXIS, tmpDir)
      } else {
        tmpUp.normalize()
        tmpSide.crossVectors(tmpUp, tmpDir)
        tmpBasis.makeBasis(tmpSide, tmpUp, tmpDir)
        tmpQuat.setFromRotationMatrix(tmpBasis)
      }
    } else {
      tmpQuat.setFromUnitVectors(Z_AXIS, tmpDir)
    }
  } else {
    tmpQuat.setFromAxisAngle(Y_AXIS, t.rotY)
  }
  return tmpMatrix.compose(tmpPos, tmpQuat, tmpScale)
}

/** Write every transform into an InstancedMesh and flag the upload. */
export function writeInstances(mesh: THREE.InstancedMesh, transforms: AnyTransform[]) {
  for (let i = 0; i < transforms.length; i++) {
    mesh.setMatrixAt(i, composeInstance(transforms[i]))
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** Heavy decorative meshes opt out of raycasting entirely (plan §28). */
export function noopRaycast() {}

/**
 * Resolve the raycast function for a mesh.
 *
 * Never pass `raycast={undefined}` to R3F: applyProps skips undefined values
 * (see @react-three/fiber "Ignore setting undefined props"), so a prop can
 * never be unset back to its default. Toggling picking that way leaves
 * whatever was applied at mount in place forever — which silently disabled
 * every click and hover once the construction intro had run.
 */
export function raycastFor(kind: 'mesh' | 'instanced', enabled: boolean) {
  if (!enabled) return noopRaycast
  return kind === 'instanced' ? THREE.InstancedMesh.prototype.raycast : THREE.Mesh.prototype.raycast
}
