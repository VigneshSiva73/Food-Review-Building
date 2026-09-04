// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ViewportControls } from './ViewportControls'
import { useRuntimeStore } from '@/state/useRuntimeStore'

afterEach(() => {
  cleanup()
  useRuntimeStore.setState({ fullMode: false })
})

describe('ViewportControls', () => {
  it('renders control buttons including the Eye symbol button right after Fullscreen', () => {
    render(<ViewportControls />)

    const fullscreenBtn = screen.getByRole('button', { name: /^fullscreen$/i })
    const eyeBtn = screen.getByRole('button', { name: /^full 3d view$/i })

    expect(fullscreenBtn).toBeTruthy()
    expect(eyeBtn).toBeTruthy()
  })

  it('toggles full 3D mode when Eye symbol button is clicked', () => {
    render(<ViewportControls />)

    const eyeBtn = screen.getByRole('button', { name: /^full 3d view$/i })
    expect(useRuntimeStore.getState().fullMode).toBe(false)

    fireEvent.click(eyeBtn)
    expect(useRuntimeStore.getState().fullMode).toBe(true)

    const exitEyeBtn = screen.getByRole('button', { name: /^exit full 3d view$/i })
    expect(exitEyeBtn).toBeTruthy()

    fireEvent.click(exitEyeBtn)
    expect(useRuntimeStore.getState().fullMode).toBe(false)
  })
})
