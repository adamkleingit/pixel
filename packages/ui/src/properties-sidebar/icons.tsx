/**
 * Exported JSX constants for icons reused across sections. These are JSX values,
 * not React components — keeps "one component per file" intact while letting
 * sections share iconography.
 */

export const plusIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <line x1="6" y1="2" x2="6" y2="10" />
    <line x1="2" y1="6" x2="10" y2="6" />
  </svg>
)

export const minusIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <line x1="2" y1="6" x2="10" y2="6" />
  </svg>
)

export const stylesIcon = (
  <svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor">
    <circle cx="4" cy="4" r="1.25" />
    <circle cx="10" cy="4" r="1.25" />
    <circle cx="4" cy="10" r="1.25" />
    <circle cx="10" cy="10" r="1.25" />
  </svg>
)

export const eyeIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M 1.5 8 Q 8 2 14.5 8 Q 8 14 1.5 8 Z" />
    <circle cx="8" cy="8" r="2.2" />
  </svg>
)

export const eyeOffIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M 2.5 8 Q 8 3 13.5 8" />
    <line x1="3" y1="13" x2="13" y2="3" />
  </svg>
)

export const dropletIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <path d="M 8 2 C 8 2 3.5 7 3.5 10 A 4.5 4.5 0 0 0 12.5 10 C 12.5 7 8 2 8 2 Z" />
  </svg>
)

export const chevronIcon = (
  <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
    <path d="M 2 4 L 5 7 L 8 4 Z" />
  </svg>
)

export const checkIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2.5 6.5 5 9 9.5 3.5" />
  </svg>
)

export const slidersIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <line x1="3" y1="5" x2="13" y2="5" />
    <circle cx="9" cy="5" r="1.6" fill="currentColor" />
    <line x1="3" y1="11" x2="13" y2="11" />
    <circle cx="6" cy="11" r="1.6" fill="currentColor" />
  </svg>
)

export const lockIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <rect x="3.5" y="7.5" width="9" height="6.5" rx="1" />
    <path d="M 5.5 7.5 V 5.5 A 2.5 2.5 0 0 1 10.5 5.5 V 7.5" />
  </svg>
)

export const opacityIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1">
    <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" strokeDasharray="1.5 1.2" />
  </svg>
)

/** Z-index — stacked layers (diamonds), Figma's "z" / stacking glyph. */
export const zIndexIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
    <path d="M 6 1.5 L 10.5 4 L 6 6.5 L 1.5 4 Z" />
    <path d="M 1.5 7 L 6 9.5 L 10.5 7" />
  </svg>
)

/** Toggle for the per-corner radius grid — a rounded square with detached
 *  corner brackets, echoing Figma's "independent corners" affordance. */
export const cornersIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M 3 6 V 4 A 1 1 0 0 1 4 3 H 6" />
    <path d="M 10 3 H 12 A 1 1 0 0 1 13 4 V 6" />
    <path d="M 13 10 V 12 A 1 1 0 0 1 12 13 H 10" />
    <path d="M 6 13 H 4 A 1 1 0 0 1 3 12 V 10" />
  </svg>
)

/** One rounded corner, rotated to each position — prefix for the per-corner
 *  radius inputs. Base glyph is the top-left corner; rotate around centre. */
function cornerGlyph(rotate: number) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M 2 11 V 5 A 3 3 0 0 1 5 2 H 11" transform={`rotate(${rotate} 6 6)`} />
    </svg>
  )
}

export const radiusTLIcon = cornerGlyph(0)
export const radiusTRIcon = cornerGlyph(90)
export const radiusBRIcon = cornerGlyph(180)
export const radiusBLIcon = cornerGlyph(270)
