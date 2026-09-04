import type { SVGProps } from 'react'

/**
 * 16px stroke icons. Unicode glyphs (⌂ ⟳ ▦ ⇕ ⛶) rendered at inconsistent
 * weights and sizes across platforms; these are uniform everywhere.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export const ReplayIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Icon>
)

export const SkipIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 4l10 8-10 8z" />
    <path d="M19 5v14" />
  </Icon>
)

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Icon>
)

/** A headland with water running past it — the island view. */
export const IslandIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 17c2.2 0 2.2 1.6 4.4 1.6S8.6 17 10.8 17s2.2 1.6 4.4 1.6S17.4 17 19.6 17H22" />
    <path d="M4 13.5c2-3.4 4-5.6 6-6.6 2.5 1.2 4.6 3.4 6.4 6.6" />
    <path d="M13.5 8.6 16 5.5l2.4 3.1" />
  </Icon>
)

export const OrbitIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" />
  </Icon>
)

export const FacadeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M9 3v18M15 3v18M4 9h16M4 15h16" />
  </Icon>
)

export const ExplodeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 8h16M4 16h16" />
    <path d="M12 2v3M12 19v3M9.5 4.5 12 2l2.5 2.5M9.5 19.5 12 22l2.5-2.5" />
  </Icon>
)

export const FullscreenIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
  </Icon>
)

export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const EyeOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </Icon>
)

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)

/* --- legend marks: small diagrams, not decorative glyphs --- */

export const PillarMark = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7 21V11M12 21V5M17 21v-7" />
    <path d="M4 21h16" />
  </Icon>
)

export const SlopeMark = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 15 21 8" />
    <path d="M3 15v4M21 8v4" />
  </Icon>
)

export const BandMark = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 7h18M3 17h18" />
    <rect x="6" y="11" width="12" height="3" rx="1" />
  </Icon>
)

export const PostMark = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 21V6" />
    <path d="M8 21h8M9 6h6" />
  </Icon>
)
