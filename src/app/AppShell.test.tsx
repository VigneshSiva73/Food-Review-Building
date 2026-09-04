// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

function renderAt(width: number) {
  window.innerWidth = width
  return render(<AppShell viewport={<p>VIEWPORT</p>} panel={<p>PANEL CONTENT</p>} />)
}

const grip = () => screen.queryByRole('button', { name: /resize information panel/i })
const detailsButton = () => screen.queryByRole('button', { name: /^details$/i })

afterEach(cleanup)

describe('AppShell responsive composition', () => {
  it('docks the panel on desktop, with no sheet affordances', () => {
    renderAt(1440)
    expect(screen.getByText('PANEL CONTENT')).toBeTruthy()
    expect(grip()).toBeNull()
    expect(detailsButton()).toBeNull()
  })

  it('puts the panel behind a slide-over on tablet', () => {
    renderAt(1024)
    expect(detailsButton()).toBeTruthy()
    expect(grip()).toBeNull()
    // Content stays mounted so it is reachable once opened.
    expect(screen.getByText('PANEL CONTENT')).toBeTruthy()
  })

  it('uses a draggable bottom sheet on a 375px phone', () => {
    renderAt(375)
    expect(grip()).toBeTruthy()
    expect(detailsButton()).toBeNull()
    expect(screen.getByText('PANEL CONTENT')).toBeTruthy()
  })

  it('keeps the viewport and its landmark in every layout', () => {
    for (const width of [375, 1024, 1440]) {
      cleanup()
      renderAt(width)
      expect(screen.getByText('VIEWPORT')).toBeTruthy()
      expect(screen.getByRole('main', { name: /3d building viewport/i })).toBeTruthy()
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    }
  })
})
