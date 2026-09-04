import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { handles, registerLights, registerScene, setRegistrationListener } from './registry'

function lightHandles() {
  return {
    hemisphere: new THREE.HemisphereLight(),
    caster: new THREE.DirectionalLight(),
    fill: new THREE.DirectionalLight(),
    boundingRadius: 80,
    totalHeight: 400,
  }
}

function sceneHandles() {
  const scene = new THREE.Scene()
  return { scene, background: new THREE.Color() }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  setRegistrationListener(null)
})

describe('time-of-day registry', () => {
  it('announces every registration, so a late arrival gets the current hour', () => {
    // This is the whole reason the listener exists. The lights re-fit whenever
    // the dataset changes and re-register; without an announcement they would
    // keep whatever they were constructed with while the rest of the scene had
    // moved on hours ago.
    const heard = vi.fn()
    setRegistrationListener(heard)
    cleanups.push(registerLights(lightHandles()))
    expect(heard).toHaveBeenCalledTimes(1)
    cleanups.push(registerScene(sceneHandles()))
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('announces to whoever is listening at the moment of registration', () => {
    // The failure this guards: the driver used to install its listener in a
    // passive effect while `Lights` registered in a layout one. React runs
    // every layout effect before any passive effect, so the announcement went
    // to nobody, the lights were never written, and the scene rendered at
    // three.js's default white at every hour until a transition swept over it.
    // The control still appeared to work, which is what made it hard to see.
    const missed = registerLights(lightHandles())
    missed()

    const heard = vi.fn()
    setRegistrationListener(heard)
    cleanups.push(registerLights(lightHandles()))
    expect(heard).toHaveBeenCalled()
  })

  it('hands back exactly what was registered', () => {
    const lights = lightHandles()
    cleanups.push(registerLights(lights))
    expect(handles.lights()).toBe(lights)
  })

  it('releases only its own registration', () => {
    // Two registrations racing during a remount must not have the older one's
    // cleanup tear down the newer one — that would leave the scene with no
    // writer at all and freeze it mid-sweep.
    const first = lightHandles()
    const releaseFirst = registerLights(first)
    const second = lightHandles()
    cleanups.push(registerLights(second))

    releaseFirst()
    expect(handles.lights()).toBe(second)
  })

  it('clears on release, so nothing writes to a dead scene', () => {
    const release = registerScene(sceneHandles())
    expect(handles.scene()).not.toBeNull()
    release()
    expect(handles.scene()).toBeNull()
  })
})
