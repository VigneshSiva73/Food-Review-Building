import { useMemo } from 'react'
import { AppShell } from './AppShell'
import { Card } from '@/components/ui/Card'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { DaySlider } from '@/components/controls/DaySlider'
import { MonthSlider } from '@/components/controls/MonthSlider'
import { ViewportControls } from '@/components/controls/ViewportControls'
import { SelectionAnnouncer } from '@/components/panels/SelectionAnnouncer'
import { HoverTooltip } from '@/components/panels/HoverTooltip'
import {
  BuildingCard,
  FloorCard,
  MealCard,
  OverviewCard,
  PillarCard,
} from '@/components/panels/StatisticsCard'
import { SceneFallback } from '@/components/panels/SceneFallback'
import { StatusOverlay } from '@/components/panels/StatusOverlay'
import { Viewport } from '@/scene/Viewport'
import { useAutoFocus } from '@/hooks/useAutoFocus'
import { useDatasetLoader } from '@/hooks/useDatasetLoader'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useMonthTransition } from '@/hooks/useMonthTransition'
import { useRuntimeStore } from '@/state/useRuntimeStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { isWebGLAvailable } from '@/utils/webgl'

/**
 * What each kind of selection asks the panel for.
 *
 * The building's parts ARE the scales of the data, so clicking one is a way of
 * asking a narrower question: the crown stands for the whole tower and asks
 * about the month, a plate is a day and asks about the floor, a column is one
 * sitting and asks about that meal, and one of the crown's ribs is that same
 * column run the height of the building and asks about the meal all month.
 * Anything else — an empty selection — leaves the panel where it rests,
 * describing everything.
 *
 * A table rather than a chain of conditions, so adding a scale is one line
 * here instead of a new branch AND an amendment to the fallback's list of
 * everything it is not. That amendment is the step that gets forgotten, and
 * forgetting it shows two cards at once.
 */
const CARDS = {
  building: { title: 'Building Statistics', Body: BuildingCard },
  floor: { title: 'Floor Statistics', Body: FloorCard },
  pillar: { title: 'Pillar Statistics', Body: PillarCard },
  meal: { title: 'Pillars Statistics', Body: MealCard },
} as const

const OVERALL = { title: 'Overall Statistics', Body: OverviewCard } as const

/**
 * App root: dataset loads through the pipeline on mount; the viewport renders
 * the building with floating controls; the side panel is the dashboard
 * (plan §30). Together the panels are a complete non-3D account of the data.
 */
export default function App() {
  const status = useDatasetLoader()
  useKeyboardShortcuts()
  useAutoFocus()
  useMonthTransition()
  const webglAvailable = useMemo(() => isWebGLAvailable(), [])
  const setSceneCrashed = useRuntimeStore((s) => s.setSceneCrashed)
  const fullMode = useRuntimeStore((s) => s.fullMode)
  const selectedKind = useSelectionStore((s) => s.selected?.kind ?? null)
  const card = (selectedKind && CARDS[selectedKind as keyof typeof CARDS]) || OVERALL

  return (
    <AppShell
      viewport={
        <>
          {webglAvailable ? (
            <ErrorBoundary
              fallback={<SceneFallback reason="crashed" />}
              onError={() => setSceneCrashed(true)}
            >
              <Viewport />
              <ViewportControls />
              {!fullMode && <MonthSlider />}
              {!fullMode && <DaySlider />}
              {/*
                Kept in full mode, unlike everything else here. Full mode hides
                the side panel, so the cursor summary stops being a convenience
                and becomes the only way to read a floor or a pillar at all —
                dropping it left the one view that is nothing but the building
                as the one view where the building could not be interrogated.
                It costs no chrome either way: it is only on screen while the
                pointer is actually over something.
              */}
              <HoverTooltip />
              {!fullMode && <SelectionAnnouncer />}
            </ErrorBoundary>
          ) : (
            <SceneFallback reason="unsupported" />
          )}
          {!fullMode && <StatusOverlay />}
        </>
      }
      panel={
        <div className="space-y-3 p-3">
          {status !== 'ready' && (
            <p className="p-1 text-sm text-ink-500">
              Details appear here once the dataset has loaded.
            </p>
          )}
          {/*
            One card at a time, at whatever scale the selection is. At rest it
            describes the WHOLE dataset and holds still while the pointer moves
            over the building — the viewport answers "what am I looking at" by
            lighting up and by the summary beside the cursor, and the panel
            answers "what is all of this". Clicking away clears the selection
            and the overall figures come back.
          */}
          {status === 'ready' && (
            <Card title={card.title} prominent>
              <card.Body />
            </Card>
          )}
        </div>
      }
    />
  )
}
