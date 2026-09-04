import {
  BandMark,
  ChevronIcon,
  PillarMark,
  PostMark,
  SlopeMark,
} from '@/components/ui/icons'

const ITEMS = [
  {
    Icon: PillarMark,
    lead: 'Pillar height = rating.',
    body: 'Each floor is one day; its three pillars are Breakfast (front-left), Lunch (front-right), and Dinner (rear).',
  },
  {
    Icon: SlopeMark,
    lead: 'A tilted floor plate',
    body: "leans toward the day's weakest meal.",
  },
  {
    Icon: BandMark,
    lead: 'Dark recessed bands',
    body: 'are leave days (Sundays and third Saturdays).',
  },
  {
    Icon: PostMark,
    lead: 'A thin steel post',
    body: 'at the rear corner marks a Saturday — no dinner is served, so no data pillar rises there.',
  },
]

/** How to read the building. Collapsible so it can be tucked away. */
export function Legend() {
  return (
    <details open className="group">
      <summary className="marker-none flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="transition-transform duration-150 group-open:rotate-90" />
        How to read the building
      </summary>
      <ul className="mt-3 space-y-2.5">
        {ITEMS.map(({ Icon, lead, body }) => (
          <li key={lead} className="flex gap-2.5 text-xs leading-relaxed text-ink-500">
            <Icon className="mt-0.5 shrink-0 text-accent-400/80" />
            <span>
              <strong className="font-medium text-ink-300">{lead}</strong> {body}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
