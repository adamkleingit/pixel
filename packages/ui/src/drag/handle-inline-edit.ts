/**
 * Double-click → inline-edit bridge for the selection handles.
 *
 * The resize / rotate / spacing / radius handles overlay the selection rect and
 * `stopPropagation()` on pointerdown, so a double-click that lands on a handle
 * never reaches the selection pointerdown handler — which is where the
 * "double-click a text element to edit it inline" gesture lives. On a SHORT
 * element the edge bands cover the whole box, so there is no handle-free spot to
 * double-click at all.
 *
 * This module is the shared seam. When a handle completes a double-click on an
 * inline-editable element (a text leaf OR a mixed-content element edited as
 * innerHTML), it dispatches `BEGIN_INLINE_EDIT_EVENT` on `window`; `Selection`
 * listens for it and opens the same inline edit session it would for a body
 * double-click.
 */
import { isInlineEditable } from '../edit/inline-text-edit'

const DOUBLE_MS = 400

let last: { at: number; element: Element | null } = { at: 0, element: null }

/** Custom event asking `Selection` to flip `detail.element` into an inline edit.
 *  Dispatched on `window` — the handles live outside the edited element, and in
 *  the in-app model everything is light DOM (no shadow root to target). */
export const BEGIN_INLINE_EDIT_EVENT = 'pixel-begin-inline-edit'

/**
 * Record a pointerdown on `element` and report whether it completes a
 * double-click on the same element within the window. Shared between the shadow
 * selection path (body clicks) and the body-portal handles, so the two clicks
 * of a double can land on different surfaces and still pair up.
 */
export function noteElementPointerDown(element: Element | null): boolean {
  const now = performance.now()
  const isDouble =
    element != null && last.element === element && now - last.at < DOUBLE_MS
  last = { at: now, element }
  return isDouble
}

/** Forget the last pointerdown — call after an edit starts or selection clears
 *  so a stale element can't pair with a future click. */
export function resetElementPointerDown(): void {
  last = { at: 0, element: null }
}

/**
 * Handle-side entry: call from a resize / rotate / spacing / radius handle's
 * pointerdown *before* starting its drag. If this click completes a double-click
 * on an inline-editable element, request the inline edit and return `true` so the
 * caller skips the drag. Otherwise returns `false` and the drag proceeds.
 */
export function maybeBeginInlineEditFromHandle(element: Element): boolean {
  const isDouble = noteElementPointerDown(element)
  if (!isDouble || !isInlineEditable(element)) return false
  window.dispatchEvent(new CustomEvent(BEGIN_INLINE_EDIT_EVENT, { detail: { element } }))
  return true
}
