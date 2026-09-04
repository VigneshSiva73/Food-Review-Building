// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EyeViewToggle } from './EyeViewToggle'
import { useRuntimeStore } from '@/state/useRuntimeStore'

afterEach(() => {
  cleanup()
  useRuntimeStore.setState({ fullMode: false })
})

describe('EyeViewToggle', () => {
  it('renders an eye symbol button on the left side and toggles full 3D mode on click', () => {
    render(<EyeViewToggle />)
    const button = screen.getByRole('button', { name: /enter full 3d mode/i })
    expect(button).toBeTruthy()
    expect(useRuntimeStore.getState().fullMode).toBe(false)

    fireEvent.click(button)
    expect(useRuntimeStore.getState().fullMode).toBe(true)
    expect(screen.getByRole('button', { name: /exit full mode/i })).toBeTruthy()

    fireEvent.click(button)
    expect(useRuntimeStore.getState().fullMode).toBe(false)
  })

  it('exits full mode on pressing Escape key', () => {
    useRuntimeStore.setState({ fullMode: true })
    render(<EyeViewToggle />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useRuntimeStore.getState().fullMode).toBe(false)
  })
})
