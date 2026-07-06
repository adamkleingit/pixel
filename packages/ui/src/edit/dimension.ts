/**
 * CSS dimension parsing/serialization for the Design pane's numeric inputs.
 *
 * A "dimension" is a number + a unit (`12px`, `1.5em`, `50%`), a unitless
 * number (`line-height: 2`), or a keyword (`auto`, `normal`, `none`). The pane
 * needs to (a) show the number and its unit separately so the unit is
 * selectable, and (b) recompose them into a valid CSS value on write.
 */

/** Length units the unit picker offers (plus `''` = unitless). */
export const LENGTH_UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh', 'pt', 'ch'] as const

/** Keyword values that stand alone (no number). Extend per-field via options. */
const KEYWORDS = new Set([
  'auto', 'normal', 'none', 'inherit', 'initial', 'unset', 'revert',
  'max-content', 'min-content', 'fit-content',
])

export interface ParsedDimension {
  /** The numeric part as a string (e.g. `12`, `1.5`, `-4`), or `''`. */
  num: string
  /** `px` / `%` / `em` / … , `''` for unitless, or a keyword like `auto`. */
  unit: string
}

/** True when `unit` is a length unit (or unitless) — i.e. it attaches to a
 *  number rather than standing alone as a keyword. */
export function isLengthUnit(unit: string): boolean {
  return unit === '' || (LENGTH_UNITS as readonly string[]).includes(unit)
}

/** Parse a raw CSS value into `{ num, unit }`. Non-simple values (e.g. `calc(…)`,
 *  multi-token) come back as a keyword-style `{ num: '', unit: <raw> }` so the
 *  picker shows them read-only rather than corrupting them. */
export function parseDimension(raw: string): ParsedDimension {
  const s = (raw ?? '').trim()
  if (!s) return { num: '', unit: '' }
  const lower = s.toLowerCase()
  if (KEYWORDS.has(lower)) return { num: '', unit: lower }
  const m = s.match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/i)
  if (m && m[1] !== '') return { num: m[1], unit: (m[2] || '').toLowerCase() }
  // Opaque (calc(), var(), multiple values) — keep verbatim as a "unit".
  return { num: '', unit: s }
}

/** Recompose a number + unit into a CSS value. A keyword unit stands alone; a
 *  length unit attaches to the number; an empty number yields `''` (clears). */
export function composeDimension(num: string, unit: string): string {
  const u = (unit ?? '').trim()
  const n = String(num ?? '').trim()
  if (u && !isLengthUnit(u)) return u // keyword or opaque value
  if (n === '') return ''
  return u === '' ? n : `${n}${u}`
}

export interface UnitOption {
  value: string
  label: string
}

/** Build the unit dropdown options for a set of length units + keywords.
 *  `unitless` adds the `—` (no unit) choice; keywords are appended as-is. */
export function unitOptions(opts: {
  lengths?: readonly string[]
  unitless?: boolean
  keywords?: readonly string[]
}): UnitOption[] {
  const out: UnitOption[] = []
  if (opts.unitless) out.push({ value: '', label: '—' })
  for (const u of opts.lengths ?? LENGTH_UNITS) out.push({ value: u, label: u })
  for (const k of opts.keywords ?? []) out.push({ value: k, label: k })
  return out
}

// Common per-property option sets --------------------------------------------

/** left/top/width/height/padding/margin/gap/border-width/font-size/radius. */
export const LENGTH_OPTIONS = unitOptions({ lengths: ['px', '%', 'em', 'rem'] })
/** width/height/min/max — length units plus `auto`. */
export const SIZE_OPTIONS = unitOptions({ lengths: ['px', '%', 'em', 'rem'], keywords: ['auto'] })
/** line-height — unitless is the norm; also px/em/% and `normal`. */
export const LINE_HEIGHT_OPTIONS = unitOptions({ lengths: ['px', 'em', '%'], unitless: true, keywords: ['normal'] })
/** letter-spacing — length units plus `normal`. */
export const LETTER_SPACING_OPTIONS = unitOptions({ lengths: ['px', 'em', 'rem'], keywords: ['normal'] })

/** The display label for a raw unit value (`''` → `—`). */
export function unitLabel(unit: string): string {
  return unit === '' ? '—' : unit
}
