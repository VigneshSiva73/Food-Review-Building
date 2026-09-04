import { cameraConfig } from '@/config'

const DEG = Math.PI / 180

export interface CameraFit {
  distance: number
  target: [number, number, number]
  position: [number, number, number]
}

/** Auto-fit pose derived purely from content bounds — dataset-agnostic (plan §24). */
export function computeFit(boundingRadius: number, totalHeight: number): CameraFit {
  const c = cameraConfig
  // Sphere that encloses the whole building (half-height + footprint radius).
  const sphereRadius = Math.hypot(totalHeight / 2, boundingRadius)
  const distance = (sphereRadius / Math.sin((c.fov / 2) * DEG)) * c.fitMargin
  const target: [number, number, number] = [0, totalHeight * c.targetHeightFraction, 0]
  const el = c.initialElevationDeg * DEG
  const az = c.initialAzimuthDeg * DEG
  const position: [number, number, number] = [
    target[0] + distance * Math.cos(el) * Math.sin(az),
    target[1] + distance * Math.sin(el),
    target[2] + distance * Math.cos(el) * Math.cos(az),
  ]
  return { distance, target, position }
}
