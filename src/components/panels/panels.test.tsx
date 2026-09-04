// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildLayout } from '@/building'
import { runPipeline } from '@/data/pipeline'
import { getDisplayedLayout } from '@/state/displayedLayout'
import { useDataStore } from '@/state/useDataStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { useFilterStore } from '@/state/useFilterStore'
import { DatasetSummaryCard } from './DatasetSummaryCard'
import {
  BuildingCard,
  FloorCard,
  MealCard,
  OverviewCard,
  PillarCard,
} from './StatisticsCard'
import { HoverTooltip } from './HoverTooltip'
import { SelectionCard } from './SelectionCard'

beforeAll(() => {
  const csvText = readFileSync(join(__dirname, '../../../public/data/food-reviews.csv'), 'utf8')
  const dataset = runPipeline(csvText)
  useDataStore.setState({ status: 'ready', dataset, layout: buildLayout(dataset.days) })
})

afterEach(() => {
  cleanup()
  useSelectionStore.getState().clear()
})

describe('DatasetSummaryCard', () => {
  it('renders the pipeline stats verbatim', () => {
    render(<DatasetSummaryCard />)
    expect(screen.getByText('Days (floors)').nextSibling?.textContent).toBe('497')
    expect(screen.getByText('Meal records').nextSibling?.textContent).toBe('1425')
    expect(screen.getByText('Duplicates removed').nextSibling?.textContent).toBe('61')
    expect(screen.getByText('Conflicts resolved').nextSibling?.textContent).toBe('15')
    expect(screen.getByText('Range').nextSibling?.textContent).toBe('01/01/2025 – 26/08/2026')
  })
})

describe('SelectionCard', () => {
  it('shows a hint when nothing is selected', () => {
    render(<SelectionCard />)
    expect(screen.getByText(/Click a pillar/)).toBeTruthy()
  })

  it('shows the exact CSV values for a selected pillar', () => {
    useSelectionStore.getState().select({ kind: 'pillar', floorIndex: 0, corner: 1 })
    render(<SelectionCard />)
    expect(screen.getByText(/Floor 1 · Wednesday 01\/01\/2025/)).toBeTruthy()
    expect(screen.getByText('Lunch')).toBeTruthy()
    expect(screen.getByText(/2\.424/)).toBeTruthy()
    expect(screen.getByText(/Smith/)).toBeTruthy()
  })

  it('ignores hover-only state so the panel does not flicker', () => {
    useSelectionStore.getState().setHovered({ kind: 'pillar', floorIndex: 0, corner: 1 })
    render(<SelectionCard />)
    expect(screen.getByText(/Click a pillar/)).toBeTruthy()
    expect(screen.queryByText(/2\.424/)).toBeNull()
  })

  it('explains the missing Saturday dinner without inventing a rating', () => {
    const layout = useDataStore.getState().layout!
    const saturday = layout.floors.find((f) => f.availableMeals.length === 2)!
    useSelectionStore
      .getState()
      .select({ kind: 'pillar', floorIndex: saturday.floorIndex, corner: 2 })
    render(<SelectionCard />)
    expect(screen.getByText('No dinner service (Saturday)')).toBeTruthy()
  })
})

describe('HoverTooltip', () => {
  beforeAll(() => {
    // The tooltip reads the DISPLAYED month, not the whole dataset.
    useFilterStore.setState({ year: 2025, month: 8, dayLimit: null })
  })

  it('summarises the pillar under the cursor', () => {
    // This is the only reading of a floor available in full 3D mode, where the
    // side panel is hidden — which is why the tooltip is mounted there and the
    // rest of the chrome is not.
    useSelectionStore.setState({ hovered: { kind: 'pillar', floorIndex: 0, corner: 1 } })
    render(<HoverTooltip />)
    expect(screen.getByText(/Lunch/)).toBeTruthy()
  })

  it('summarises the floor under the cursor', () => {
    useSelectionStore.setState({ hovered: { kind: 'floor', floorIndex: 0 } })
    render(<HoverTooltip />)
    // Whatever it says, it names the day — a summary with no date on it is not
    // a summary of anything.
    expect(screen.getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeTruthy()
  })

  it('says nothing when the pointer is over nothing', () => {
    useSelectionStore.setState({ hovered: null })
    const { container } = render(<HoverTooltip />)
    expect(container.textContent?.trim()).toBe('')
  })
})

describe('OverviewCard', () => {
  it('describes the whole dataset, not the month on screen', () => {
    // The panel's one job now. Every figure here is dataset-wide, and the
    // month filter must not move any of them — that is the whole reason the
    // card can hold still while the pointer sweeps the building.
    render(<OverviewCard />)
    useFilterStore.setState({ year: 2025, month: 8, dayLimit: null })
    const before = screen.getByText('Range').parentElement!.textContent
    cleanup()

    useFilterStore.setState({ year: 2026, month: 3, dayLimit: null })
    render(<OverviewCard />)
    expect(screen.getByText('Range').parentElement!.textContent).toBe(before)
  })

  it('reports every figure asked of it', () => {
    render(<OverviewCard />)
    for (const label of [
      'Average rating',
      'Buildings',
      'Floors',
      'Pillars',
      'Totals',
      'Average people',
      'Per floor (day)',
      'Per building (month)',
      'All meals',
      'Tallest',
      'Shortest',
      'Buildings (months)',
      'Days (floors)',
      'Meals (pillars)',
      'Range',
    ]) {
      expect(screen.getByText(label, { exact: true })).toBeTruthy()
    }
    // Best and worst are asked twice — of the buildings and of the floors —
    // and each meal twice, once for its rating and once for its attendance.
    expect(screen.getAllByText('Best')).toHaveLength(2)
    expect(screen.getAllByText('Worst')).toHaveLength(2)
    for (const meal of ['Breakfast', 'Lunch', 'Dinner']) {
      expect(screen.getAllByText(meal)).toHaveLength(2)
    }
  })

  it('lays the attendance funnel out as a real table', () => {
    // Not a grid of rows that looks like one. The three stages are only
    // meaningful beside each other, and a table is what says so to a screen
    // reader as well as to the eye — every figure announced with its stage and
    // its row rather than as a bare number in a list.
    render(<OverviewCard />)
    const funnel = screen.getAllByRole('table')[0]
    const stages = within(funnel).getAllByRole('columnheader').map((th) => th.textContent)
    // The first column is named, not blank: the rows are three meals AND two
    // aggregates over them, and an unlabelled header leaves the reader to work
    // out which kind each one is.
    expect(stages).toEqual(['Group', 'Put', 'Ate', 'Rev'])
    // Three meals, a floor and a building.
    expect(within(funnel).getAllByRole('row')).toHaveLength(6)
    for (const label of ['Breakfast', 'Per floor (day)', 'Per building (month)']) {
      expect(within(funnel).getByRole('rowheader', { name: label })).toBeTruthy()
    }
  })

  it('places the extreme pillars in a building and on a floor', () => {
    // A tallest pillar the reader cannot walk to is a statistic. The model
    // exists to turn statistics into places.
    render(<OverviewCard />)
    // Two floors and two pillars: every extreme the card names is placed, on
    // its own line under the figure. The floor number, not the date — they
    // name the same day, and the floor is the half the reader can act on.
    expect(screen.getAllByText(/^[A-Z][a-z]+ \d{4} · Floor \d+$/)).toHaveLength(4)
  })
})

describe('BuildingCard', () => {
  beforeAll(() => {
    useFilterStore.setState({ year: 2025, month: 8, dayLimit: null })
  })

  it('names the building it is describing', () => {
    render(<BuildingCard />)
    expect(screen.getByText('Year').parentElement!.textContent).toContain('2025')
    expect(screen.getByText('Month').parentElement!.textContent).toContain('August')
  })

  it('leaves out the rows a single building cannot answer', () => {
    // "Per building" and "Buildings (months)" would be the building saying its
    // own name back — one row that can only read "itself" and another that can
    // only read "1".
    render(<BuildingCard />)
    expect(screen.queryByText('Per building (month)')).toBeNull()
    expect(screen.queryByText('Buildings (months)')).toBeNull()
    // And the whole Buildings group with them: best and worst of one.
    expect(screen.queryByText('Buildings')).toBeNull()
  })

  it('keeps everything a single building can answer', () => {
    render(<BuildingCard />)
    for (const label of [
      'Average rating',
      'Average people',
      'Floors',
      'Pillars',
      'Totals',
      'Per floor (day)',
      'Days (floors)',
      'Meals (pillars)',
      'Range',
    ]) {
      expect(screen.getByText(label, { exact: true })).toBeTruthy()
    }
  })

  it('drops the month from a place it has already named', () => {
    // The card IS one building, so repeating its month under every extreme is
    // the heading said four more times.
    render(<BuildingCard />)
    expect(screen.getAllByText(/^Floor \d+$/)).toHaveLength(4)
  })

  it('describes the month on screen, and follows it', () => {
    // The figures are the month's own, not the dataset's.
    render(<BuildingCard />)
    // The range, not the floor count: two different months can happen to have
    // the same number of working days, and a test that passes by coincidence
    // fails the same way.
    const august = screen.getByText('Range').parentElement!.textContent
    expect(august).toContain('/08/2025')
    cleanup()

    useFilterStore.setState({ year: 2026, month: 3, dayLimit: null })
    render(<BuildingCard />)
    const march = screen.getByText('Range').parentElement!.textContent
    expect(march).not.toBe(august)
    expect(march).toContain('/03/2026')
    expect(screen.getByText('Month').parentElement!.textContent).toContain('March')
  })
})

describe('FloorCard', () => {
  beforeAll(() => {
    useFilterStore.setState({ year: 2025, month: 8, dayLimit: null })
  })

  it('names the floor it is describing', () => {
    useSelectionStore.setState({ selected: { kind: 'floor', floorIndex: 0 } })
    render(<FloorCard />)
    expect(screen.getByText('Year').parentElement!.textContent).toContain('2025')
    expect(screen.getByText('Month').parentElement!.textContent).toContain('August')
    // The floor number is the position in the month on screen, so the first
    // floor is 1 rather than 0.
    expect(screen.getByText('Floor no.').parentElement!.textContent).toContain('1')
    expect(screen.getByText('Day').parentElement!.textContent).toMatch(/\d{2}\/08\/2025/)
  })

  it('reports the three meals twice: in plan order, then by height', () => {
    useSelectionStore.setState({ selected: { kind: 'floor', floorIndex: 0 } })
    render(<FloorCard />)
    for (const label of ['Rating', 'People', 'Pillars', 'Average', 'Total']) {
      expect(screen.getByText(label, { exact: true })).toBeTruthy()
    }
    // Rating, attendance and pillars — each meal named three times.
    for (const meal of ['Breakfast', 'Lunch', 'Dinner']) {
      expect(screen.getAllByText(meal)).toHaveLength(3)
    }
  })

  it('leaves the floor number off its own pillars', () => {
    // Every pillar here stands on the floor the card is already naming.
    useSelectionStore.setState({ selected: { kind: 'floor', floorIndex: 3 } })
    render(<FloorCard />)
    expect(screen.queryByText(/^Floor \d+$/)).toBeNull()
  })

  it('shows nothing at all when the selection is not a floor', () => {
    useSelectionStore.setState({ selected: { kind: 'building' } })
    const { container } = render(<FloorCard />)
    expect(container.textContent?.trim()).toBe('')
  })
})

describe('PillarCard', () => {
  beforeAll(() => {
    useFilterStore.setState({ year: 2025, month: 8, dayLimit: null })
  })

  it('names the pillar it is describing, down to the meal', () => {
    useSelectionStore.setState({ selected: { kind: 'pillar', floorIndex: 0, corner: 1 } })
    render(<PillarCard />)
    expect(screen.getByText('Year').parentElement!.textContent).toContain('2025')
    expect(screen.getByText('Month').parentElement!.textContent).toContain('August')
    expect(screen.getByText('Floor no.').parentElement!.textContent).toContain('1')
    expect(screen.getByText('Day').parentElement!.textContent).toMatch(/\d{2}\/08\/2025/)
    // Corner 1 is Lunch, on every floor and in the crown alike. Named twice on
    // this card — as the row that says which pillar, and as the heading of the
    // one-row funnel below — so the row is asked for by its own term.
    const meal = screen.getAllByText('Meal').find((el) => el.tagName === 'DT')!
    expect(meal.parentElement!.textContent).toContain('Lunch')
  })

  it('gives the rating and the vendor that served it', () => {
    useSelectionStore.setState({ selected: { kind: 'pillar', floorIndex: 0, corner: 1 } })
    render(<PillarCard />)
    const day = useDataStore.getState().dataset!.days.find((d) => d.date.startsWith('2025-08-01'))!
    const review = day.meals.Lunch!
    expect(screen.getByText('Rating').parentElement!.textContent).toContain(
      review.rating.toFixed(3),
    )
    expect(screen.getByText('Vendor').parentElement!.textContent).toContain(review.vendor)
  })

  it('counts the sitting itself, not an average of sittings', () => {
    useSelectionStore.setState({ selected: { kind: 'pillar', floorIndex: 0, corner: 0 } })
    render(<PillarCard />)
    const funnel = screen.getByRole('table')
    expect(within(funnel).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Meal',
      'Put',
      'Ate',
      'Rev',
    ])
    // One row, named for the meal — there is nothing here to aggregate.
    expect(within(funnel).getAllByRole('row')).toHaveLength(2)
    expect(within(funnel).getByRole('rowheader', { name: 'Breakfast' })).toBeTruthy()
  })

  it('explains a closed kitchen rather than printing zeroes', () => {
    // Found in the DISPLAYED month, not the dataset-wide layout: a floor index
    // is a position in the building on screen, so a Saturday's index in the
    // whole run names some ordinary Tuesday in August.
    const august = getDisplayedLayout()!
    const saturday = august.floors.find((f) => f.availableMeals.length === 2)!
    useSelectionStore.setState({
      selected: { kind: 'pillar', floorIndex: saturday.floorIndex, corner: 2 },
    })
    render(<PillarCard />)
    expect(screen.getByText('No dinner service (Saturday)')).toBeTruthy()
    expect(screen.getByText('Rating').parentElement!.textContent).toContain('—')
    expect(screen.getByText('Vendor').parentElement!.textContent).toContain('—')
  })

  it('shows nothing at all when the selection is not a pillar', () => {
    useSelectionStore.setState({ selected: { kind: 'floor', floorIndex: 0 } })
    const { container } = render(<PillarCard />)
    expect(container.textContent?.trim()).toBe('')
  })
})

describe('MealCard', () => {
  beforeAll(() => {
    useFilterStore.setState({ year: 2025, month: 8, dayLimit: null })
  })

  it('names the column it is describing', () => {
    // Corner 1 is Lunch, in the plan and in the crown's ribs alike.
    useSelectionStore.setState({ selected: { kind: 'meal', corner: 1 } })
    render(<MealCard />)
    expect(screen.getByText('Year').parentElement!.textContent).toContain('2025')
    expect(screen.getByText('Month').parentElement!.textContent).toContain('August')
    const meal = screen.getAllByText('Meal').find((el) => el.tagName === 'DT')!
    expect(meal.parentElement!.textContent).toContain('Lunch')
  })

  it('counts pillars, not floors', () => {
    // A Saturday serves no dinner, so the dinner column is shorter than the
    // building is tall — reporting the floor count would invent pillars.
    useSelectionStore.setState({ selected: { kind: 'meal', corner: 2 } })
    render(<MealCard />)
    const pillars = Number(
      screen.getByText('Pillar count').parentElement!.textContent!.match(/\d+/)![0],
    )
    const august = useDataStore
      .getState()
      .dataset!.days.filter((d) => d.date.startsWith('2025-08'))
    expect(pillars).toBe(august.filter((d) => d.meals.Dinner).length)
    expect(pillars).toBeLessThan(august.length)
  })

  it('lists the vendors that served it', () => {
    useSelectionStore.setState({ selected: { kind: 'meal', corner: 1 } })
    render(<MealCard />)
    const table = screen.getAllByRole('table')[0]
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Vendor',
      'Meals',
      'Avg',
    ])
    // Whoever they are, every row is a real vendor from the file.
    const august = useDataStore
      .getState()
      .dataset!.days.filter((d) => d.date.startsWith('2025-08'))
    const served = new Set(august.flatMap((d) => (d.meals.Lunch ? [d.meals.Lunch.vendor] : [])))
    const listed = within(table)
      .getAllByRole('rowheader')
      .map((th) => th.textContent!)
    expect(listed.length).toBe(served.size)
    for (const vendor of listed) expect(served.has(vendor)).toBe(true)
  })

  it('reports the column\'s people per sitting and in total', () => {
    useSelectionStore.setState({ selected: { kind: 'meal', corner: 0 } })
    render(<MealCard />)
    const funnel = screen.getAllByRole('table')[1]
    expect(within(funnel).getByRole('rowheader', { name: 'Average' })).toBeTruthy()
    expect(within(funnel).getByRole('rowheader', { name: 'Total' })).toBeTruthy()
  })

  it('drops the month from floors that are all in it', () => {
    useSelectionStore.setState({ selected: { kind: 'meal', corner: 1 } })
    render(<MealCard />)
    // Tallest and shortest, each placed on a bare floor number: the card has
    // already named the month in its own first group.
    expect(screen.getAllByText(/^Floor \d+$/)).toHaveLength(2)
  })

  it('shows nothing at all when the selection is not a meal', () => {
    useSelectionStore.setState({ selected: { kind: 'building' } })
    const { container } = render(<MealCard />)
    expect(container.textContent?.trim()).toBe('')
  })
})
