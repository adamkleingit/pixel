/**
 * Spacing mirror — Figma-style modifier expansion for padding / margin / gap.
 *
 * A single drag (canvas bar or design-pane scrub) can be expanded to several
 * properties depending on the modifier state, reading live each frame:
 *
 *   - **Alt / Option** → also write the **opposite** side (top↔bottom for the
 *     y axis, left↔right for the x axis). For gap, "opposite" is the cross
 *     axis (row-gap ↔ column-gap), so alt locks both gaps together.
 *   - **Alt + Shift** → write **all four** sides of the same kind (padding or
 *     margin). Gap has no fourth dimension; alt+shift behaves like alt for it.
 *
 * Pure helper, no DOM. Tested in spacing-mirror.test.ts.
 */

export type SpacingSide = 'top' | 'right' | 'bottom' | 'left'
export type SpacingKind = 'padding' | 'margin'
export type SpacingProperty =
  | `${SpacingKind}-${SpacingSide}`
  | 'row-gap'
  | 'column-gap'

const SIDES: SpacingSide[] = ['top', 'right', 'bottom', 'left']
const OPPOSITE: Record<SpacingSide, SpacingSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** Parse a `${kind}-${side}` property. Returns null for anything else. */
export function parseSpacingProperty(
  property: string,
): { kind: SpacingKind; side: SpacingSide } | null {
  const m = property.match(/^(padding|margin)-(top|right|bottom|left)$/)
  if (!m) return null
  return { kind: m[1] as SpacingKind, side: m[2] as SpacingSide }
}

/**
 * Properties to write together for a drag/scrub of `property` under the given
 * modifier state. Always includes `property` itself first; deduplicated.
 * Properties outside the padding/margin/gap family pass through unchanged.
 */
export function mirrorPropertiesFor(
  property: string,
  alt: boolean,
  shift: boolean,
): string[] {
  if (property === 'row-gap' || property === 'column-gap') {
    // Alt locks both gaps; alt+shift has nothing more to do.
    if (alt) return ['row-gap', 'column-gap']
    return [property]
  }
  const parsed = parseSpacingProperty(property)
  if (!parsed) return [property]
  if (!alt) return [property]
  if (shift) return SIDES.map(s => `${parsed.kind}-${s}`)
  return [property, `${parsed.kind}-${OPPOSITE[parsed.side]}`]
}
