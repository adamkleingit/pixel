/**
 * Multi-edit helpers — collapse per-element reads to a single value or a
 * "multiple" sentinel; fan a single patch across the whole element set.
 *
 * See tech-specs/multi-edit.md §4.1. Sections that take `elements: Element[]`
 * use these to decide whether to render a real value or a "Multiple"
 * placeholder in their inputs, and to apply edits to every matched element.
 */

// Re-export the multi-element patch helper from `edit/patch` so sections can
// keep importing it from here alongside the readShared helpers. The real
// implementation lives in patch.ts because it needs access to the
// reporter-suppression flag — see spec §6 ("one applyChange per gesture").
export { applyPatchAll } from '../edit/patch'

import type { Token } from '../pixel-common'
import { applyPatchAll as _applyPatchAll } from '../edit/patch'
import { tokenSourceFor } from './token-mapping'

/**
 * Token-aware patch helper: writes the token's resolved value to the live DOM
 * AND attaches a `source` payload (property-aware spelling) so the agent ends
 * up writing the symbolic form in source instead of the resolved value.
 *
 * Sections call this from their picker `onSelect` and from snap-bound numeric
 * edits.
 */
export function applyTokenAll(
  elements: readonly Element[],
  property: string,
  token: Token,
): void {
  _applyPatchAll(elements, {
    kind: 'setStyle',
    property,
    value: token.value,
    source: tokenSourceFor(token, property),
  })
}

export type SharedValue =
  | { kind: 'none' }
  | { kind: 'single'; value: string }
  | { kind: 'multiple' }

export function readShared(
  elements: Element[],
  read: (el: Element) => string,
): SharedValue {
  if (elements.length === 0) return { kind: 'none' }
  const first = read(elements[0])
  for (let i = 1; i < elements.length; i++) {
    if (read(elements[i]) !== first) return { kind: 'multiple' }
  }
  return { kind: 'single', value: first }
}

/** Convenience for input bindings — empty string when "Multiple" or "none". */
export function sharedDisplayValue(s: SharedValue): string {
  return s.kind === 'single' ? s.value : ''
}

export const MULTIPLE_PLACEHOLDER = 'Multiple'
