import { useMemo } from 'react'
import { CORNER_MEALS } from '@/building'
import { daysForMonth, MONTH_NAMES } from '@/building/monthFilter'
import {
  datasetOverview,
  floorStatistics,
  mealStatistics,
  pillarStatistics,
  type DatasetOverview,
  type MeanAttendance,
  type VendorTally,
} from '@/data/overview'
import { FloorPreview } from '@/scene/FloorPreview'
import { PillarPreview } from '@/scene/PillarPreview'
import { useDisplayedLayout } from '@/state/displayedLayout'
import { useDataStore } from '@/state/useDataStore'
import { useFilterStore } from '@/state/useFilterStore'
import { useSelectionStore } from '@/state/useSelectionStore'
import { isoToDisplay } from '@/utils/date'

/**
 * The statistics panel, at either of two scales.
 *
 * The same figures answer both questions — what is all of this, and what is
 * this one building — so they are computed by the same function over different
 * days and laid out by the same component. Two hand-written cards would drift:
 * the day a row is added to one, the other quietly stops matching it.
 *
 * The scale decides only what to LEAVE OUT. A building has no "per building"
 * average and is not a count of buildings; both would be the building saying
 * its own name back, and a panel full of rows that can only ever read "1" and
 * "itself" is a panel that has stopped telling the reader anything.
 */

type Scope = 'dataset' | 'building'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      {/*
        Both halves wrap — a long month name against a long range is wider than
        the panel at any width worth designing for, and a value clipped at the
        edge is one the reader cannot check. But only the VALUE may break
        inside a word: labels are single words often enough that "Tallest"
        came out as "Talle/st", and a hyphenless break in a two-word column is
        harder to read than the overflow it prevents.
      */}
      <dt className="min-w-0 text-ink-500">{label}</dt>
      <dd className="tnum min-w-0 text-right font-medium break-words">{value}</dd>
    </div>
  )
}

/**
 * One block of the overview, ruled off from the one before it.
 *
 * The rule is on the group rather than between them so the first has none —
 * the card's own heading already draws a rule under itself, and a second one
 * immediately below would read as a doubled border rather than as a division.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-surface-700/70 pt-4 first:border-t-0 first:pt-0">
      {/*
        Centred, larger than it was and underlined, so a group heading is
        legible as a heading on its own rather than only by the gap above it —
        but kept clearly under the card's own title, which is what names the
        whole panel. These are set in capitals, and capitals hold more of their
        line than lower case does, so they have to be a step smaller than the
        title rather than merely a point or two, or the two read as equals.
      */}
      <h3 className="text-center text-xs font-semibold tracking-[0.08em] text-ink-400 uppercase underline decoration-surface-600 underline-offset-4">
        {title}
      </h3>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

/**
 * Where a floor or a pillar stands, under the figure itself.
 *
 * The rating alone is the number; this is what makes it findable. A tallest
 * pillar the reader cannot walk to is a statistic, and the model exists to
 * turn statistics into places.
 *
 * The floor number, not the date. They name the same day, and the floor is the
 * half of it the reader can act on — it is what they will count up the tower
 * to. The month stays only where it is still a question: a card that IS one
 * building has already answered it in its own heading.
 */
function whereIs(at: Place, scope: Scope): string {
  const floor = `Floor ${at.floor}`
  return scope === 'building' || !at.month ? floor : `${at.month} · ${floor}`
}

/**
 * Anywhere in the model that can be pointed to: a floor of some building.
 *
 * The month is optional because some of these are already inside one. A column
 * read down a single building names its floors and nothing else — every one of
 * them is in the month the card is about.
 */
type Place = { floor: number; month?: string }

/**
 * One extreme: what it is and what it reads, with where it is underneath.
 *
 * The place was tried on the same line and does not fit. A label, a month, a
 * floor, a meal and a rating is more than the panel is wide, and what gives
 * way first is the label — "Tallest" broke across two lines mid-word, which is
 * worse than the second line it was trying to avoid. Underneath, in the
 * quieter ink, the figure stays the thing the eye lands on and the address is
 * there for whoever wants to go and look.
 */
function Extreme({
  label,
  value,
  at,
  scope,
}: {
  label: string
  value: string
  at: Place
  scope: Scope
}) {
  return (
    <>
      <Row label={label} value={value} />
      <p className="text-right text-xs text-ink-500">{whereIs(at, scope)}</p>
    </>
  )
}

/**
 * The attendance funnel as a table: served, ate, reviewed.
 *
 * A real table, ruled on all four sides. The three numbers are only meaningful
 * beside each other — the story is the drop from one column to the next — and
 * a table is what says that to a screen reader as well as to the eye: the
 * header cells name the stages once, and every figure is announced with the
 * stage and the row it belongs to instead of as a bare number in a list.
 *
 * The rules are drawn rather than implied by alignment. Aligned columns read
 * as a table to whoever laid them out and as a list of numbers to everybody
 * else, and this one has two different kinds of row in it — three meals, then
 * two aggregates over them — which the eye only separates if the grid is
 * actually there.
 *
 * Labels wrap rather than truncate. "Per building (month)" does not fit the
 * panel at any width worth designing for, and a row clipped to "Per buildi…"
 * is a row the reader has to guess at.
 */
function seat(value: number | undefined): string {
  // A dash where nothing was recorded. Nought served is a different claim from
  // "this file does not say", and the panel must not make the first on the
  // strength of the second.
  return value === undefined ? '—' : Math.round(value).toLocaleString()
}

/**
 * Every cell carries the same rule and the same centring, so the grid closes
 * on all four sides and the columns read as columns rather than as text that
 * happens to line up.
 */
const CELL = 'border border-surface-700/70 px-2 py-1 text-center'

function SeatTable({
  rows,
  /**
   * What the first column holds. Named rather than left blank: an unlabelled
   * header on a table whose rows are three meals AND two aggregates over them
   * leaves the reader to work out what kind of thing a row is.
   */
  label = 'Group',
}: {
  rows: { label: string; seats: MeanAttendance }[]
  label?: string
}) {
  // Auto layout, not fixed. The averages are three digits and the totals six
  // with separators in them, and a column sized for one clips the other —
  // which is exactly what a fixed 3.25rem did to 152,837. The first column
  // takes `w-full` so it absorbs whatever the figures leave, which is the
  // table-layout way of saying "the label gets the slack".
  return (
    <table className="w-full table-auto border-collapse text-sm">
      <thead>
        <tr className="bg-surface-800/70 text-[10px] tracking-wide text-ink-500 uppercase">
          <th className={`${CELL} w-full font-semibold`} scope="col">
            {label}
          </th>
          {['Put', 'Ate', 'Rev'].map((stage) => (
            <th key={stage} className={`${CELL} font-semibold whitespace-nowrap`} scope="col">
              {stage}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="align-middle">
            <th
              scope="row"
              className={`${CELL} w-full text-sm font-normal break-words hyphens-auto text-ink-500`}
            >
              {row.label}
            </th>
            {/* Never broken mid-number: "152,8" over "37" is not a number. */}
            <td className={`${CELL} tnum font-medium whitespace-nowrap`}>
              {seat(row.seats?.count)}
            </td>
            <td className={`${CELL} tnum font-medium whitespace-nowrap`}>
              {seat(row.seats?.consumed)}
            </td>
            <td className={`${CELL} tnum font-medium whitespace-nowrap`}>
              {seat(row.seats?.reviewed)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Who served this meal, how often, and how it went.
 *
 * Only a column's worth of meals has vendors to compare — one sitting has a
 * single vendor and the whole dataset has the same few over and over — so this
 * table exists at exactly one scale. Ruled like the attendance funnel, and for
 * the same reason: three figures that are only meaningful beside each other.
 */
function VendorTable({ rows }: { rows: VendorTally[] }) {
  return (
    <table className="w-full table-auto border-collapse text-sm">
      <thead>
        <tr className="bg-surface-800/70 text-[10px] tracking-wide text-ink-500 uppercase">
          <th className={`${CELL} w-full font-semibold`} scope="col">
            Vendor
          </th>
          <th className={`${CELL} font-semibold whitespace-nowrap`} scope="col">
            Meals
          </th>
          <th className={`${CELL} font-semibold whitespace-nowrap`} scope="col">
            Avg
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.vendor} className="align-middle">
            <th
              scope="row"
              className={`${CELL} w-full text-sm font-normal break-words hyphens-auto text-ink-500`}
            >
              {row.vendor}
            </th>
            <td className={`${CELL} tnum font-medium whitespace-nowrap`}>{row.count}</td>
            <td className={`${CELL} tnum font-medium whitespace-nowrap`}>
              {row.average.toFixed(3)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Statistics({
  overview,
  scope,
  /**
   * A group set above the figures, inside the SAME stack.
   *
   * Rendering it in a wrapper of its own would put it outside the run that
   * draws the dividing rules, and the first rule would then fall under
   * "Average rating" instead of between the two — leaving the building's name
   * looking like part of the block beneath it.
   */
  lead,
}: {
  overview: DatasetOverview
  scope: Scope
  lead?: React.ReactNode
}) {
  const building = scope === 'building'

  return (
    <div className="space-y-4">
      {lead}
      <Group title="Average rating">
        {overview.averages.map(({ meal, average, count }) => (
          <Row key={meal} label={meal} value={count > 0 ? average.toFixed(3) : '—'} />
        ))}
        <Row
          label="All meals"
          value={overview.overall === null ? '—' : overview.overall.toFixed(3)}
        />
      </Group>

      <Group title="Average people">
        <SeatTable
          rows={[
            ...overview.averages.map(({ meal, attendance }) => ({
              label: meal,
              seats: attendance,
            })),
            { label: 'Per floor (day)', seats: overview.perDay },
            // A building has no per-building average: it would be its own
            // total said twice.
            ...(building ? [] : [{ label: 'Per building (month)', seats: overview.perMonth }]),
          ]}
        />
      </Group>

      {!building && (
        <Group title="Buildings">
          <Row
            label="Best"
            value={
              overview.bestMonth
                ? `${overview.bestMonth.label} · ${overview.bestMonth.average.toFixed(3)}`
                : '—'
            }
          />
          <Row
            label="Worst"
            value={
              overview.worstMonth
                ? `${overview.worstMonth.label} · ${overview.worstMonth.average.toFixed(3)}`
                : '—'
            }
          />
        </Group>
      )}

      <Group title="Floors">
        {overview.bestFloor && (
          <Extreme
            label="Best"
            value={overview.bestFloor.average.toFixed(3)}
            at={overview.bestFloor}
            scope={scope}
          />
        )}
        {overview.worstFloor && (
          <Extreme
            label="Worst"
            value={overview.worstFloor.average.toFixed(3)}
            at={overview.worstFloor}
            scope={scope}
          />
        )}
      </Group>

      <Group title="Pillars">
        {overview.tallest && (
          <Extreme
            label="Tallest"
            value={`${overview.tallest.meal} · ${overview.tallest.rating.toFixed(3)}`}
            at={overview.tallest}
            scope={scope}
          />
        )}
        {overview.shortest && (
          <Extreme
            label="Shortest"
            value={`${overview.shortest.meal} · ${overview.shortest.rating.toFixed(3)}`}
            at={overview.shortest}
            scope={scope}
          />
        )}
      </Group>

      <Group title="Totals">
        {/* A building is not a count of buildings. */}
        {!building && <Row label="Buildings (months)" value={String(overview.months)} />}
        <Row label="Days (floors)" value={String(overview.days)} />
        <Row label="Meals (pillars)" value={String(overview.meals)} />
        <Row
          label="Range"
          value={
            overview.range
              ? `${isoToDisplay(overview.range.start)} – ${isoToDisplay(overview.range.end)}`
              : '—'
          }
        />
        {/* Last, so the counted rows above it read as one run and the table
            below closes the group rather than interrupting it. */}
        <SeatTable label="Total" rows={[{ label: 'People', seats: overview.totals }]} />
      </Group>
    </div>
  )
}

/** The whole body of reviews. The panel's resting state. */
export function OverviewCard() {
  const days = useDataStore((s) => s.dataset?.days)
  const overview = useMemo(() => (days ? datasetOverview(days) : null), [days])
  if (!overview) return null
  return <Statistics overview={overview} scope="dataset" />
}

/**
 * One month, as its own building.
 *
 * Reads the month the FILTER is on rather than one carried in the selection.
 * A building reference names "the tower on screen" and nothing else — there is
 * only ever one — so a selection that outlived a change of month would name
 * the new building, and the card would be describing what the reader is
 * actually looking at either way. Storing a month in the ref would let the two
 * disagree.
 */
export function BuildingCard() {
  const days = useDataStore((s) => s.dataset?.days)
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)

  const overview = useMemo(
    () =>
      days && year !== null && month !== null
        ? datasetOverview(daysForMonth(days, { year, month }))
        : null,
    [days, year, month],
  )

  if (!overview || year === null || month === null) return null
  return (
    <Statistics
      overview={overview}
      scope="building"
      lead={
        <Group title="Building">
          <Row label="Year" value={String(year)} />
          <Row label="Month" value={MONTH_NAMES[month - 1]} />
        </Group>
      }
    />
  )
}

/**
 * One day, as its own floor.
 *
 * The floor NUMBER comes from the selection and the date from the layout,
 * because they are two different facts: the number is a position in the month
 * on screen, and it moves when the filter does, while the date is fixed to the
 * reviews. Deriving either from the other has been wrong every time it was
 * tried elsewhere in this app.
 */
export function FloorCard() {
  const selected = useSelectionStore((s) => s.selected)
  const layout = useDisplayedLayout()
  const days = useDataStore((s) => s.dataset?.days)

  const floorIndex = selected?.kind === 'floor' ? selected.floorIndex : null
  const module = floorIndex === null ? null : (layout?.floors[floorIndex] ?? null)
  const date = module?.date ?? null
  const stats = useMemo(() => {
    const day = date ? days?.find((d) => d.date === date) : undefined
    return day ? floorStatistics(day) : null
  }, [days, date])

  if (!stats || floorIndex === null || !module) return null
  const floor = floorIndex + 1

  return (
    <div className="space-y-4">
      {/*
        Above the figures, because it is what they are about. A reader who has
        just clicked a plate in a tower of twenty-five wants to see the thing
        they picked before they read numbers off it.
      */}
      <FloorPreview floor={module} />
      <Group title="Floor">
        <Row label="Year" value={String(stats.year)} />
        <Row label="Month" value={stats.month} />
        {/* Not just "Floor": the group is already called that, and a row
            with the same name as its own heading reads as a repeat. */}
        <Row label="Floor no." value={String(floor)} />
        <Row label="Day" value={isoToDisplay(stats.date)} />
      </Group>

      <Group title="Rating">
        {stats.meals.map(({ meal, rating }) => (
          <Row key={meal} label={meal} value={rating === null ? '—' : rating.toFixed(3)} />
        ))}
        <Row label="Average" value={stats.average === null ? '—' : stats.average.toFixed(3)} />
      </Group>

      <Group title="People">
        <SeatTable
          label="Meal"
          rows={[
            ...stats.meals.map(({ meal, attendance }) => ({ label: meal, seats: attendance })),
            { label: 'Total', seats: stats.totals },
          ]}
        />
      </Group>

      {/*
        The same three meals again, by height this time — which is what the
        floor actually looks like from outside. No place under them: every
        pillar here stands on the floor the card is already naming.
      */}
      <Group title="Pillars">
        {stats.ranked.map(({ meal, rating }) => (
          <Row key={meal} label={meal} value={rating === null ? 'no rating' : rating.toFixed(3)} />
        ))}
      </Group>
    </div>
  )
}


/**
 * One meal, as its own pillar.
 *
 * The end of the same ladder: the dataset, a building, a floor, and now the
 * single sitting a floor is made of three of. Every card above this one
 * averages something; this one averages nothing, because a pillar IS one
 * record — so it reports what the file says and stops, and the vendor appears
 * here for the first time for the same reason. A name is not a statistic, and
 * there was nowhere higher up the ladder it could have been said without being
 * a list of every kitchen in the month.
 *
 * The meal comes from the pillar the reader clicked rather than from the
 * corner index, so the card and the tower cannot disagree about which column
 * is Lunch even if the solver's corner order is ever rearranged.
 */
export function PillarCard() {
  const selected = useSelectionStore((s) => s.selected)
  const layout = useDisplayedLayout()
  const days = useDataStore((s) => s.dataset?.days)

  const ref = selected?.kind === 'pillar' ? selected : null
  const module = ref ? (layout?.floors[ref.floorIndex] ?? null) : null
  const date = module?.date ?? null
  const meal = module && ref ? module.pillars[ref.corner].meta.mealType : null
  const stats = useMemo(() => {
    const day = date ? days?.find((d) => d.date === date) : undefined
    return day && meal ? pillarStatistics(day, meal) : null
  }, [days, date, meal])

  if (!stats || !ref || !module) return null

  return (
    <div className="space-y-4">
      {/*
        The column itself, above the figures — the same order the floor card
        uses, and for the same reason: a reader who has just clicked one of
        seventy-five columns wants to see the thing they picked before they
        read numbers off it.
      */}
      <PillarPreview floor={module} corner={ref.corner} />
      {/*
        Where the pillar stands, before what it says — the same order the other
        cards use, and here it carries the whole address: a rating means one
        thing on a Monday breakfast and another on a Friday dinner, and the
        reader has just clicked one column out of seventy-five.
      */}
      <Group title="Pillar">
        <Row label="Year" value={String(stats.year)} />
        <Row label="Month" value={stats.month} />
        <Row label="Floor no." value={String(ref.floorIndex + 1)} />
        <Row label="Day" value={isoToDisplay(stats.date)} />
        <Row label="Meal" value={stats.meal} />
      </Group>

      <Group title="Review">
        <Row label="Rating" value={stats.rating === null ? '—' : stats.rating.toFixed(3)} />
        <Row label="Vendor" value={stats.vendor ?? '—'} />
        {/*
          Two dashes are ambiguous on their own, and the difference is the one
          thing this card knows that the reader cannot see: the tower draws a
          plain steel post either way.
        */}
        {stats.rating === null && (
          <p className="text-right text-xs text-ink-500">
            {stats.weekday === 6
              ? `No ${stats.meal.toLowerCase()} service (Saturday)`
              : 'No record for this sitting'}
          </p>
        )}
      </Group>

      {/*
        The same funnel the floor and the dataset show, over a single sitting.
        These are the counts themselves rather than a mean of them, which is
        why the row is named for the meal and not for a group of them.
      */}
      <Group title="People">
        <SeatTable label="Meal" rows={[{ label: stats.meal, seats: stats.attendance }]} />
      </Group>
    </div>
  )
}


/**
 * One meal, read down a whole building.
 *
 * The column the crown's ribs stand for: every Lunch in the month, rather than
 * one of them or all three of a day. It is the widest reading that still has a
 * single answer to "who cooked it", which is why the vendors appear here and
 * nowhere else — a sitting has one, and the dataset has the same handful over
 * and over.
 *
 * The month comes from the FILTER, as the building card's does. A meal
 * reference names a column of the tower on screen and carries no month of its
 * own, so there is nothing here that can disagree with what the reader is
 * looking at.
 */
export function MealCard() {
  const selected = useSelectionStore((s) => s.selected)
  const days = useDataStore((s) => s.dataset?.days)
  const year = useFilterStore((s) => s.year)
  const month = useFilterStore((s) => s.month)

  // The solver's corner order, read from the same table the scene indexes the
  // ribs by, so the card and the tower cannot disagree about which is Lunch.
  const meal = selected?.kind === 'meal' ? CORNER_MEALS[selected.corner] : null
  const stats = useMemo(
    () =>
      days && meal && year !== null && month !== null
        ? mealStatistics(daysForMonth(days, { year, month }), meal)
        : null,
    [days, meal, year, month],
  )

  if (!stats || !meal || year === null || month === null) return null

  return (
    <div className="space-y-4">
      <Group title="Pillars">
        <Row label="Year" value={String(year)} />
        <Row label="Month" value={MONTH_NAMES[month - 1]} />
        <Row label="Meal" value={meal} />
        {/* Rated sittings, not the month's floors: a column runs the height of
            the building but only stands where the meal was served. Named for
            the count rather than for the thing, since the group above it is
            already called Pillars and a row with its heading's name reads as a
            repeat. */}
        <Row label="Pillar count" value={String(stats.pillars)} />
      </Group>

      <Group title="Rating">
        <Row label="Average" value={stats.average === null ? '—' : stats.average.toFixed(3)} />
        {stats.tallest && (
          <Extreme
            label="Tallest"
            value={stats.tallest.rating.toFixed(3)}
            at={stats.tallest}
            scope="building"
          />
        )}
        {stats.shortest && (
          <Extreme
            label="Shortest"
            value={stats.shortest.rating.toFixed(3)}
            at={stats.shortest}
            scope="building"
          />
        )}
      </Group>

      <Group title="Vendors">
        {stats.vendors.length > 0 ? (
          <VendorTable rows={stats.vendors} />
        ) : (
          <Row label="Vendor" value="—" />
        )}
      </Group>

      <Group title="People">
        <SeatTable
          label={meal}
          rows={[
            // Per sitting first, then the month's whole count — the same order
            // the overall card puts an average and a total in.
            { label: 'Average', seats: stats.attendance },
            { label: 'Total', seats: stats.totals },
          ]}
        />
      </Group>
    </div>
  )
}
