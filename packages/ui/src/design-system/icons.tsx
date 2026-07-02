/**
 * Pixel icon set — minimal lucide-style stroke icons.
 *
 * Each icon is a pure functional component that takes `size` (default 14) and
 * passes `currentColor` through to `stroke`, so consumers control color via
 * the parent's `color` style. Add new icons here rather than inlining SVGs in
 * components.
 *
 * Visual style: 24×24 viewBox, 1.6 stroke width, round caps + joins, no fill.
 */

import type { SVGProps } from 'react'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number
}

function Icon({ size = 14, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export const ZapIcon = (p: IconProps) => (
  <Icon {...p}><path d="M13 2 L4 14 H11 L11 22 L20 10 H13 Z" /></Icon>
)

export const CodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
)

export const GitBranchIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </Icon>
)

export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </Icon>
)

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}><line x1="5" y1="12" x2="19" y2="12" /></Icon>
)

export const Maximize2Icon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </Icon>
)

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}><polyline points="6 9 12 15 18 9" /></Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><polyline points="9 18 15 12 9 6" /></Icon>
)

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
)

export const InspectIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8V5a2 2 0 0 1 2-2h3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="m10 10 6 3-3 1-1 3-2-7Z" />
  </Icon>
)

export const BugIcon = (p: IconProps) => (
  <Icon {...p}>
    {/* Body */}
    <rect x="8" y="6" width="8" height="14" rx="4" />
    {/* Head + antennae */}
    <path d="M9 6a3 3 0 0 1 6 0" />
    <path d="M9 4 7.5 2.5" />
    <path d="m15 4 1.5-1.5" />
    {/* Legs */}
    <path d="M8 10 4 9" />
    <path d="M8 14H3" />
    <path d="m8 18-4 1" />
    <path d="m16 10 4-1" />
    <path d="M16 14h5" />
    <path d="m16 18 4 1" />
    {/* Spine */}
    <line x1="12" y1="9" x2="12" y2="18" />
  </Icon>
)

/** Checkmark (✓) — accept / confirm. */
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="m5 13 4 4L19 7" /></Icon>
)

/** Contrast / difference glyph — circle outline with the right half filled. */
export const ContrastIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
  </Icon>
)

/** Side-by-side diff glyph — two panes split by a divider. Used for the image
 *  diff (before / diff / after) toggle. */
export const SplitDiffIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <line x1="12" y1="5" x2="12" y2="19" />
  </Icon>
)

export const VideoIcon = (p: IconProps) => (
  <Icon {...p}>
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </Icon>
)

export const PaletteIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </Icon>
)

export const MultiSelectIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3"  y="3"  width="8" height="8" rx="1.5" />
    <rect x="13" y="3"  width="8" height="8" rx="1.5" />
    <rect x="3"  y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </Icon>
)

/** Arrow cursor — used for the "force element state" affordance (the pseudo
 *  states a pointer drives: :hover, :active, :focus). */
export const MousePointerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="m13 13 6 6" />
  </Icon>
)

export const LeftPaneIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </Icon>
)

export const RightPaneIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="15" y1="4" x2="15" y2="20" />
  </Icon>
)

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </Icon>
)

export const ComponentIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
)

export const StoryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 4l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1.5-2h5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
)

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </Icon>
)

export const LoaderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 a9 9 0 1 1 -6.36 2.64" />
  </Icon>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </Icon>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </Icon>
)

// Device-size toggles for the preview chrome (desktop / tablet / mobile).
export const MonitorIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </Icon>
)

export const TabletIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="12" y1="18" x2="12" y2="18" />
  </Icon>
)

export const SmartphoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <line x1="12" y1="18" x2="12" y2="18" />
  </Icon>
)

/** Toolbar / chrome icons re-used by primitives — keep here so the design
 *  system owns its own glyph set.                                          */
