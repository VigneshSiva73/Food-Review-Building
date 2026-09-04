// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLayout } from '@/building'
import { runPipeline } from '@/data/pipeline'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'
import { useRuntimeStore } from '@/state/useRuntimeStore'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { StatusOverlay } from './StatusOverlay'

afterEach(() => {
  cleanup()
  useDataStore.setState({ status: 'idle', dataset: null, layout: null, error: null })
  useRuntimeStore.setState({ contextLost: false, sceneCrashed: false })
  useFilterStore.setState({ year: null, month: null, dayLimit: null })
})

describe('StatusOverlay', () => {
  it('explains the loading state', () => {
    useDataStore.setState({ status: 'loading' })
    render(<StatusOverlay />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText(/loading dataset/i)).toBeTruthy()
  })

  it('shows the failure reason with a retry action', () => {
    useDataStore.setState({ status: 'error', error: 'HTTP 404' })
    render(<StatusOverlay />)
    expect(screen.getByText(/could not load the dataset/i)).toBeTruthy()
    expect(screen.getByText('HTTP 404')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('explains an empty dataset rather than showing a blank viewport', () => {
    useDataStore.setState({ status: 'empty' })
    render(<StatusOverlay />)
    expect(screen.getByText(/no usable records/i)).toBeTruthy()
  })

  it('takes over when the GPU context is lost, whatever the data status', () => {
    useDataStore.setState({ status: 'ready' })
    useRuntimeStore.setState({ contextLost: true })
    render(<StatusOverlay />)
    expect(screen.getByText(/graphics context lost/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
  })

  it('renders nothing once the building is ready', () => {
    useDataStore.setState({ status: 'ready' })
    const { container } = render(<StatusOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('treats an empty month as "No data", offering the latest month that has some', () => {
    const csvText = readFileSync(
      join(__dirname, '../../../public/data/food-reviews.csv'),
      'utf8',
    )
    const dataset = runPipeline(csvText)
    useDataStore.setState({ status: 'ready', dataset, layout: buildLayout(dataset.days) })
    // The dataset stops at August 2026, so December of that year is empty.
    useFilterStore.setState({ year: 2026, month: 12, dayLimit: null })

    render(<StatusOverlay />)
    expect(screen.getByText('No data in December 2026')).toBeTruthy()
    screen.getByRole('button', { name: /go to august 2026/i }).click()
    expect(useFilterStore.getState()).toMatchObject({ year: 2026, month: 8 })
  })

  it('does not show the no-data overlay for a month that has reviews', () => {
    const csvText = readFileSync(
      join(__dirname, '../../../public/data/food-reviews.csv'),
      'utf8',
    )
    const dataset = runPipeline(csvText)
    useDataStore.setState({ status: 'ready', dataset, layout: buildLayout(dataset.days) })
    useFilterStore.setState({ year: 2026, month: 6, dayLimit: null })

    const { container } = render(<StatusOverlay />)
    expect(container.firstChild).toBeNull()
  })
})

function Boom(): React.ReactElement {
  throw new Error('WebGL init failed')
}

describe('ErrorBoundary', () => {
  it('renders the fallback instead of propagating a scene crash', () => {
    const errors: Error[] = []
    // The thrown error is expected; keep the test output readable.
    const consoleError = console.error
    console.error = () => {}
    render(
      <ErrorBoundary fallback={<p>FALLBACK</p>} onError={(e) => errors.push(e)}>
        <Boom />
      </ErrorBoundary>,
    )
    console.error = consoleError
    expect(screen.getByText('FALLBACK')).toBeTruthy()
    expect(errors[0]?.message).toBe('WebGL init failed')
  })
})
