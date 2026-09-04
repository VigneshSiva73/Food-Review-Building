import type * as THREE from 'three'

/**
 * The reflection probe as it stands, for anyone drawing the same world in
 * another canvas.
 *
 * `EnvironmentLight` owns it and writes here; everyone else reads. The side
 * panel's floor preview has a renderer of its own, and glazing is nearly a
 * mirror — without the same environment its panes reflect nothing and come out
 * black beside the ones in the viewport, which is the difference between "the
 * same glass" and "a dark shape the same size".
 *
 * Borrowed rather than rebuilt, and that is not only thrift: the time-of-day
 * registry holds exactly ONE sky rebuild, so a second `EnvironmentLight`
 * mounted in the preview would displace the viewport's own and leave the
 * building reflecting whichever canvas unmounted last.
 *
 * Read it fresh at the point of use. Each repaint replaces the texture and
 * disposes the one before it, so a reference held across an hour change goes
 * stale.
 *
 * Its own module rather than an export from the component, because a component
 * file that also exports plain functions loses fast refresh — the same reason
 * the material caches live apart from the components that use them.
 */

let live: THREE.Texture | null = null

export function setSkyEnvironment(texture: THREE.Texture | null): void {
  live = texture
}

export function currentSkyEnvironment(): THREE.Texture | null {
  return live
}
