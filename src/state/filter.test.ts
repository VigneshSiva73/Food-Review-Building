import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildLayout } from '@/building'
import { runPipeline } from '@/data/pipeline'
import { displayedLayout } from './displayedLayout'
import { useDataStore } from './useDataStore'
import { useFilterStore } from './useFilterStore'
import { useSelectionStore } from './useSelectionStore'

const csvText = readFileSync(join(__dirname, '../../public/data/food-reviews.csv'), 'utf8')
const dataset = runPipeline(csvText)
const fullLayout = buildLayout(dataset.days)

beforeEach(() => {
  useFilterStore.setState({ year: null, month: null, dayLimit: null })
  useSelectionStore.getState().clear()
  useDataStore.setState({ status: 'ready', dataset, layout: fullLayout })
})

describe('displayedLayout', () => {
  it('falls back to the full tower only before a month has been chosen', () => {
    expect(displayedLayout(dataset, fullLayout, 2026, null)).toBe(fullLayout)
    expect(displayedLayout(dataset, fullLayout, null, 6)).toBe(fullLayout)
  })

  it('builds a standalone month building starting at ground level', () => {
    const june = displayedLayout(dataset, fullLayout, 2026, 6)!
    expect(june).not.toBe(fullLayout)
    expect(june.floors.length).toBeGreaterThan(0)
    expect(june.floors[0].baseY).toBe(0)
    expect(june.floors.every((f) => f.date.startsWith('2026-06'))).toBe(true)
    // Month floor indexes are local to the month building.
    expect(june.floors[0].floorIndex).toBe(0)
  })

  it('is referentially stable for identical inputs (memo)', () => {
    const a = displayedLayout(dataset, fullLayout, 2026, 7)
    const b = displayedLayout(dataset, fullLayout, 2026, 7)
    expect(a).toBe(b)
  })

  it('yields an empty building for a month without data', () => {
    // The dataset stops at August 2026; the rest of that year is empty.
    const december = displayedLayout(dataset, fullLayout, 2026, 12)!
    expect(december.floors).toEqual([])
  })
})

describe('useFilterStore', () => {
  it('resets the day limit when the month changes', () => {
    useFilterStore.getState().setMonth(6)
    useFilterStore.getState().setDayLimit(12)
    expect(useFilterStore.getState().dayLimit).toBe(12)
    useFilterStore.getState().setMonth(7)
    expect(useFilterStore.getState().dayLimit).toBeNull()
  })

  it('clears a stale selection synchronously on month change', () => {
    useSelectionStore.getState().select({ kind: 'floor', floorIndex: 40 })
    useFilterStore.getState().setMonth(6)
    expect(useSelectionStore.getState().selected).toBeNull()
  })

  it('selectMonthForDate switches to the month the date belongs to', () => {
    useFilterStore.getState().setYear(2026)
    useFilterStore.getState().setMonth(6)
    useFilterStore.getState().selectMonthForDate('2026-07-15')
    expect(useFilterStore.getState()).toMatchObject({ year: 2026, month: 7, dayLimit: null })

    // Across years too — the dataset spans more than one.
    useFilterStore.getState().selectMonthForDate('2025-03-04')
    expect(useFilterStore.getState()).toMatchObject({ year: 2025, month: 3, dayLimit: null })
  })

  it('opens on the most recent month with data, and never overrides a choice', () => {
    useFilterStore.getState().initialiseFrom(dataset.days)
    expect(useFilterStore.getState()).toMatchObject({ year: 2026, month: 8 })

    useFilterStore.getState().setMonth(2)
    useFilterStore.getState().initialiseFrom(dataset.days)
    expect(useFilterStore.getState().month).toBe(2)
  })
})

describe('cross-month stats link flow', () => {
  it('switches month and resolves the floor in the newly displayed building', () => {
    // Viewing June; the "best day" lives in July.
    useFilterStore.getState().setYear(2026)
    useFilterStore.getState().setMonth(6)
    const date = fullLayout.floors.find((f) => f.date.startsWith('2026-07'))!.date

    // Same sequence the stats card runs:
    useFilterStore.getState().selectMonthForDate(date)
    const { year, month } = useFilterStore.getState()
    const shown = displayedLayout(dataset, fullLayout, year, month)!
    const floor = shown.floors.find((f) => f.date === date)!
    useSelectionStore.getState().select({ kind: 'floor', floorIndex: floor.floorIndex })

    expect(month).toBe(7)
    expect(shown.floors.every((f) => f.date.startsWith('2026-07'))).toBe(true)
    // The selection made after the switch survives (the store cleared before it).
    expect(useSelectionStore.getState().selected).toEqual({
      kind: 'floor',
      floorIndex: floor.floorIndex,
    })
  })
})
