import { useId, type ReactNode } from 'react'

/** The card's own chrome, shared by both halves of a prominent one. */
const SHELL = 'rounded-xl border border-surface-700/70 bg-surface-800/50'
const INSET = { boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.04)' }

/** Panel card: consistent chrome for the dashboard sections. */
export function Card({
  title,
  /**
   * Heads the card as a title rather than as a label, in a box of its own.
   *
   * The small tracked capitals are right for a card that sits in a stack of
   * them, where the heading's job is to separate one section from the next. A
   * card that is the whole panel has nothing to separate itself from, and at
   * that size its heading reads as a caption on the content instead of as the
   * name of the thing — so it is set larger, in its own case, and centred.
   *
   * Separated from the figures by a BOX rather than by a rule. The content is
   * already full of rules — the groups are ruled off from each other and the
   * table is ruled on all four sides — so one more line would have joined that
   * system instead of standing outside it, and the title would have read as
   * the first row of the thing it names.
   *
   * Both boxes stay inside one `section`, tied together by `aria-labelledby`.
   * Splitting the heading into a container of its own is a visual decision and
   * must not cost the content its heading.
   */
  prominent = false,
  children,
}: {
  title: string
  prominent?: boolean
  children: ReactNode
}) {
  const headingId = useId()

  if (prominent) {
    return (
      <section aria-labelledby={headingId} className="space-y-3">
        <div className={`${SHELL} px-4 py-3`} style={INSET}>
          <h2
            id={headingId}
            className="text-center text-base font-semibold tracking-tight text-ink-100"
          >
            {title}
          </h2>
        </div>
        <div className={`${SHELL} p-4`} style={INSET}>
          {children}
        </div>
      </section>
    )
  }

  return (
    <section className={`${SHELL} p-4`} style={INSET}>
      <h2
        id={headingId}
        className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}
