// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildLayout } from '@/building'
import { runPipeline } from '@/data/pipeline'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'
import { DaySlider } from './DaySlider'
import { MonthSlider } from './MonthSlider'

const csvText = readFileSync(join(__dirname, '../../../public/data/food-reviews.csv'), 'utf8')
const dataset = runPipeline(csvText)

beforeEach(() => {
  useDataStore.setState({ status: 'ready', dataset, layout: buildLayout(dataset.days) })
  useFilterStore.setState({ year: null, month: null, dayLimit: null })
})

afterEach(cleanup)

describe('MonthSlider', () => {
  it('offers the twelve months and nothing else, marking the empty ones', () => {
    render(<MonthSlider />)
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(12)
    // The default year is 2026, which runs out of reviews after August.
    expect(screen.getByRole('button', { name: 'Jun' }).getAttribute('title')).toBeNull()
    expect(screen.getByRole('button', { name: 'Dec' }).getAttribute('title')).toBe('No data')
  })

  it('spans January to December and switches month from a label', () => {
    render(<MonthSlider />)
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('min')).toBe('1')
    expect(slider.getAttribute('max')).toBe('12')
    fireEvent.click(screen.getByRole('button', { name: 'Jun' }))
    expect(useFilterStore.getState()).toMatchObject({ month: 6, year: 2026 })
  })

  it('offers every year in the dataset as a separate control', () => {
    useFilterStore.setState({ year: 2026, month: 6 })
    render(<MonthSlider />)
    const select = screen.getByRole('combobox', { name: 'Year' }) as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['2025', '2026'])
    fireEvent.change(select, { target: { value: '2025' } })
    expect(useFilterStore.getState()).toMatchObject({ year: 2025, month: 6 })
  })

  it('shows the month name once, and the year only in the year control', () => {
    useFilterStore.setState({ year: 2026, month: 6 })
    render(<MonthSlider />)
    expect(screen.getByText('June')).toBeTruthy()
    expect(screen.getAllByText('2026')).toHaveLength(1) // the <option>, not the heading
  })
})

describe('DaySlider', () => {
  it('stays hidden until a month has been chosen', () => {
    const { container } = render(<DaySlider />)
    expect(container.firstChild).toBeNull()
  })

  it('spans the calendar month and starts un-sliced', () => {
    useFilterStore.setState({ year: 2026, month: 6, dayLimit: null })
    render(<DaySlider />)
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('max')).toBe('30') // June
    expect(slider.getAttribute('aria-valuetext')).toBe('Day 30 of 30')
  })

  it('caps the building, and clears the cap when slid back to the top', () => {
    useFilterStore.setState({ year: 2026, month: 6, dayLimit: null })
    render(<DaySlider />)
    const slider = screen.getByRole('slider')

    fireEvent.change(slider, { target: { value: '12' } })
    expect(useFilterStore.getState().dayLimit).toBe(12)

    // Back at the top means "whole month", not a cap pinned to the last day.
    fireEvent.change(slider, { target: { value: '30' } })
    expect(useFilterStore.getState().dayLimit).toBeNull()
  })
})
