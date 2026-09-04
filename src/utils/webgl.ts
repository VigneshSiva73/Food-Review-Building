/**
 * WebGL feature detection (plan §33). Runs before the Canvas mounts so an
 * unsupported browser gets a designed fallback instead of a blank rectangle
 * or an uncaught three.js error.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    // Free the probe context immediately; browsers cap simultaneous contexts.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}
