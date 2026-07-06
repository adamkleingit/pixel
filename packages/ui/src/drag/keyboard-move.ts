/**
 * Keyboard move — arrow-key repositioning of the selected element, the
 * keyboard analog of reposition-drag.ts. Mirrors Pixel's two layout-aware
 * move behaviors, picked from the element's own `position`:
 *
 *   - **absolutely positioned** (`absolute` / `fixed`) → nudge `top`/`left`.
 *     Arrow direction sets the axis + sign; Shift jumps by 10px instead of 1px.
 *   - **in-flow** (`static` / `relative` / … flex & block children) → reorder
 *     the element within its parent's flow children. Up/Left steps one slot
 *     earlier, Down/Right one slot later; Shift jumps to the first/last slot.
 *
 * Pure: reads the live DOM and returns the edit-history `Change[]` to commit
 * (or `null` for a no-op — e.g. an in-flow element already at the boundary).
 * The caller (`Selection.onKeyDown`) feeds the result to `history.commit`,
 * which performs the actual DOM mutation and records one reversible entry.
 * `move` before/after are DOM child indices in the *excluding-target* space
 * that `edit-history.applyValue('move')` consumes; the `top`/`left` writes are
 * offset-relative CSS px, matching reposition-drag's `stepAbsolute`.
 */

import type { Change } from '../edit/edit-history'

const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

/** Per-press nudge for absolutely-positioned elements; Shift multiplies. */
const NUDGE_PX = 1
const NUDGE_PX_SHIFT = 10

export function isArrowKey(key: string): boolean {
  return ARROW_KEYS.has(key)
}

/** An element participates in its parent's flow (and so takes a reorder slot)
 *  unless it's taken out of flow or not rendered. Mirrors the filter in
 *  insertion-index.ts `flowChildren`. */
function participatesInFlow(el: Element): boolean {
  const cs = getComputedStyle(el)
  if (cs.position === 'absolute' || cs.position === 'fixed') return false
  if (cs.display === 'none' || cs.display === 'contents') return false
  return true
}

/** Index of `refNode` within `parent.children` *excluding* `target` — the
 *  exact index space `edit-history.applyValue('move')` reads (it inserts
 *  `target` before `siblingsExcludingTarget[index]`, or appends when the index
 *  is past the end). `null` ref → append (length). */
function exclIndex(parent: Element, target: Element, refNode: Element | null): number {
  const excl = Array.from(parent.children).filter((c) => c !== target)
  if (!refNode) return excl.length
  const i = excl.indexOf(refNode)
  return i === -1 ? excl.length : i
}

/**
 * Resolve the change(s) for an arrow-key move on `element`, or `null` if the
 * key isn't an arrow or the move is a no-op (boundary). `key` is the
 * `KeyboardEvent.key`; `shiftKey` toggles the 10px-jump / first-last behavior.
 */
export function computeKeyboardMove(
  element: HTMLElement,
  key: string,
  shiftKey: boolean,
): { changes: Change[]; label: string } | null {
  if (!isArrowKey(key)) return null
  const parent = element.parentElement
  if (!parent) return null

  const cs = getComputedStyle(element)
  const isAbsolute = cs.position === 'absolute' || cs.position === 'fixed'

  if (isAbsolute) return nudgeAbsolute(element, cs, key, shiftKey)
  return reorderInFlow(element, parent, key, shiftKey)
}

/** Nudge `top`/`left` for an out-of-flow element. */
function nudgeAbsolute(
  element: HTMLElement,
  cs: CSSStyleDeclaration,
  key: string,
  shiftKey: boolean,
): { changes: Change[]; label: string } | null {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
  const property = horizontal ? 'left' : 'top'
  const sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
  const step = (shiftKey ? NUDGE_PX_SHIFT : NUDGE_PX) * sign

  // Offset-relative base mirrors reposition-drag's `startLeft/startTop`. For
  // `fixed` (offsetParent is null) fall back to the viewport rect — `top`/`left`
  // on a fixed element are viewport-relative too.
  const rect = element.getBoundingClientRect()
  const base = horizontal
    ? cs.position === 'fixed'
      ? rect.left
      : element.offsetLeft
    : cs.position === 'fixed'
      ? rect.top
      : element.offsetTop

  const before = element.style.getPropertyValue(property)
  const after = `${Math.round(base) + step}px`
  return { changes: [{ target: element, kind: 'style', name: property, before, after }], label: property }
}

/** Reorder an in-flow element among its parent's flow children. */
function reorderInFlow(
  element: HTMLElement,
  parent: HTMLElement,
  key: string,
  shiftKey: boolean,
): { changes: Change[]; label: string } | null {
  const dir = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1

  const flow = Array.from(parent.children).filter(participatesInFlow)
  const curIdx = flow.indexOf(element)
  if (curIdx === -1) return null // element isn't a flow child (shouldn't happen)

  const lastIdx = flow.length - 1
  const newIdx = shiftKey ? (dir < 0 ? 0 : lastIdx) : curIdx + dir
  if (newIdx < 0 || newIdx > lastIdx || newIdx === curIdx) return null // boundary

  // Insert `element` before the flow child currently sitting at `newIdx` in the
  // target-excluded order (or append when that lands past the end).
  const flowNoTarget = flow.filter((c) => c !== element)
  const afterRef = flowNoTarget[newIdx] ?? null

  const before = String(exclIndex(parent, element, element.nextElementSibling))
  const after = String(exclIndex(parent, element, afterRef))
  if (before === after) return null

  return { changes: [{ target: element, kind: 'move', name: '', before, after }], label: 'move' }
}
