import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { composeInstance, noopRaycast, raycastFor } from './instancing'

/**
 * Regression guard for the bug that silently disabled every click and hover:
 * picking was toggled with `raycast={interactive ? undefined : noopRaycast}`,
 * but R3F's applyProps skips undefined values, so the noop applied during the
 * construction intro was never replaced. A raycast resolver must therefore
 * always return a real function.
 */
describe('raycastFor', () => {
  it('never returns undefined', () => {
    for (const kind of ['mesh', 'instanced'] as const) {
      for (const enabled of [true, false]) {
        expect(typeof raycastFor(kind, enabled)).toBe('function')
      }
    }
  })

  it('disables picking with the shared noop', () => {
    expect(raycastFor('mesh', false)).toBe(noopRaycast)
    expect(raycastFor('instanced', false)).toBe(noopRaycast)
  })

  it('restores the three.js implementation for the right object type', () => {
    expect(raycastFor('mesh', true)).toBe(THREE.Mesh.prototype.raycast)
    expect(raycastFor('instanced', true)).toBe(THREE.InstancedMesh.prototype.raycast)
    expect(raycastFor('instanced', true)).not.toBe(THREE.Mesh.prototype.raycast)
  })

  it('actually finds an instance once re-enabled', () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), undefined, 1)
    mesh.setMatrixAt(0, new THREE.Matrix4())
    mesh.instanceMatrix.needsUpdate = true
    mesh.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1))

    // Disabled: the noop reports nothing.
    mesh.raycast = raycastFor('instanced', false)
    expect(raycaster.intersectObject(mesh)).toHaveLength(0)

    // Re-enabled: hits come back, which is what the intro used to break.
    mesh.raycast = raycastFor('instanced', true)
    const hits = raycaster.intersectObject(mesh)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].instanceId).toBe(0)
  })
})

/**
 * `align` fixes the beam axis but leaves the roll about it free, which is fine
 * for a square section and wrong for a profiled one. `up` pins the third
 * degree of freedom.
 */
describe('composeInstance with an up axis', () => {
  const unit = { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotY: 0 }
  const basisOf = (m: THREE.Matrix4) => {
    const e = m.elements
    return {
      x: new THREE.Vector3(e[0], e[1], e[2]),
      y: new THREE.Vector3(e[4], e[5], e[6]),
      z: new THREE.Vector3(e[8], e[9], e[10]),
    }
  }

  it('points local +z along align and local +y at up', () => {
    const align = new THREE.Vector3(1, 0.3, -0.6).normalize()
    const up = new THREE.Vector3(0.1, 1, 0.25).normalize()
    const basis = basisOf(composeInstance({ ...unit, align, up }))

    expect(basis.z.dot(align)).toBeCloseTo(1)
    // Up is orthogonalised against the axis, so it cannot match exactly — but
    // it must stay in the plane the two of them span, on the up side.
    expect(basis.y.dot(up)).toBeGreaterThan(0.9)
    expect(basis.y.dot(basis.z)).toBeCloseTo(0)
  })

  it('stays a right-handed orthonormal basis', () => {
    const basis = basisOf(
      composeInstance({
        ...unit,
        align: new THREE.Vector3(0, 1, 0),
        up: new THREE.Vector3(0, 0.2, 1).normalize(),
      }),
    )
    for (const v of [basis.x, basis.y, basis.z]) expect(v.length()).toBeCloseTo(1)
    expect(new THREE.Vector3().crossVectors(basis.x, basis.y).dot(basis.z)).toBeCloseTo(1)
  })

  it('falls back instead of producing NaN when up is parallel to align', () => {
    const align = new THREE.Vector3(0, 0, 1)
    const m = composeInstance({ ...unit, align, up: align })
    for (const e of m.elements) expect(Number.isFinite(e)).toBe(true)
    expect(basisOf(m).z.dot(align)).toBeCloseTo(1)
  })

  it('leaves transforms without an up on the original path', () => {
    // Additive by design: every existing aligned instance must compose exactly
    // as it did before the field existed.
    const align = new THREE.Vector3(0.4, -0.2, 0.9).normalize()
    const withOut = composeInstance({ ...unit, align }).clone()
    const legacy = new THREE.Matrix4().compose(
      new THREE.Vector3(),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), align),
      new THREE.Vector3(1, 1, 1),
    )
    for (let i = 0; i < 16; i++) expect(withOut.elements[i]).toBeCloseTo(legacy.elements[i], 6)
  })
})
