import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cityConfig } from '@/config'
import type { SignalState } from '@/city'
import { LAMP_HEAD } from './propGeometry'

/**
 * Signal heads and lamp lenses (plan §22).
 *
 * The post and its housing are one merged geometry standing on y = 0 and
 * facing +Z, like every other prop. The aspects are separate: a lamp has to
 * change colour independently of the housing, and instancing gives one
 * material per mesh.
 */

/** Vertical offset of each aspect from the centre of the head. */
export const ASPECT_OFFSETS: Record<SignalState, number> = {
  red: cityConfig.signals.lampPitch,
  yellow: 0,
  green: -cityConfig.signals.lampPitch,
}

export const ASPECTS: SignalState[] = ['red', 'yellow', 'green']

/** Centre of the head above the post base. */
export function headHeight(): number {
  return cityConfig.signals.postHeight + cityConfig.signals.lampPitch * 1.5
}

/** How far the aspect discs stand proud of the housing face. */
export const LAMP_FACE_Z = 0.13

let postGeom: THREE.BufferGeometry | null = null

export function signalPostGeometry(): THREE.BufferGeometry {
  if (!postGeom) {
    const { postHeight, lampPitch } = cityConfig.signals
    const housing = lampPitch * 3.3
    const pole = new THREE.CylinderGeometry(0.075, 0.1, postHeight, 8)
    pole.translate(0, postHeight / 2, 0)
    const box = new THREE.BoxGeometry(lampPitch * 1.5, housing, 0.24)
    box.translate(0, headHeight(), 0)
    // A hood over the top aspect, which is what makes the housing read as a
    // signal head rather than as a box on a stick.
    const hood = new THREE.BoxGeometry(lampPitch * 1.7, 0.06, 0.34)
    hood.translate(0, headHeight() + housing / 2, 0.08)
    postGeom = mergeGeometries([pole, box, hood])!
  }
  return postGeom
}

let lampGeom: THREE.BufferGeometry | null = null

/** One aspect disc, facing +Z. */
export function signalLampGeometry(): THREE.BufferGeometry {
  if (!lampGeom) {
    const g = new THREE.CylinderGeometry(
      cityConfig.signals.lampRadius,
      cityConfig.signals.lampRadius,
      0.06,
      10,
    )
    // Cylinders are built around Y; stand this one on its edge so the disc
    // faces the same way the housing does.
    g.rotateX(Math.PI / 2)
    lampGeom = g
  }
  return lampGeom
}

let lensGeom: THREE.BufferGeometry | null = null

/** The warm diffuser under a street lamp's head. */
export function lampLensGeometry(): THREE.BufferGeometry {
  if (!lensGeom) {
    const { height, overhang } = cityConfig.signals.lampLens
    lensGeom = new THREE.BoxGeometry(
      LAMP_HEAD.width * overhang,
      height,
      LAMP_HEAD.depth * overhang,
    )
  }
  return lensGeom
}

/** Height of the lens centre above the lamp's base, in its local frame. */
export function lampLensY(): number {
  const { height } = cityConfig.signals.lampLens
  // Immediately beneath the housing's underside.
  return cityConfig.props.lampHeight - LAMP_HEAD.drop - LAMP_HEAD.height / 2 - height / 2
}

export function disposeSignalGeometry(): void {
  postGeom?.dispose()
  postGeom = null
  lampGeom?.dispose()
  lampGeom = null
  lensGeom?.dispose()
  lensGeom = null
}
