/**
 * Cross-surface double-click → inline-edit bridge for the selection handles.
 *
 * The resize / rotate / spacing handles render in a `<body>`-level portal and
 * `stopPropagation()` on pointerdown, so a double-click that lands on a handle
 * never reaches the shadow's selection pointerdown handler — which is where the
 * "double-click a text element to edit it inline" gesture normally lives. The
 * result: text under a handle (the whole element edge, every padding/margin/gap
 * bar) can't be opened for editing.
 *
 * This module is the shared seam. Both surfaces feed `noteElementPointerDown`
 * with the element they pressed on, so a select-on-the-body-then-click-a-handle
 * double still registers as one gesture. When a handle completes a double on a
 * text-editable element, it dispatches `BEGIN_INLINE_EDIT_EVENT` on the
 * element's shadow root; `useSelection` listens for it and opens the same inline
 * edit session it would for a body double-click.
 */
import { isTextEditable } from '../edit/inline-text-edit'

const DOUBLE_MS = 400

let last: { at: number; element: Element | null } = { at: 0, element: null }

/** Custom event asking `useSelection` to flip `detail.element` into inline-text
 *  edit. Dispatched on the element's shadow root (handles live outside it). */
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
 * Handle-side entry: call from a resize / rotate / spacing handle's pointerdown
 * *before* starting its drag. If this click completes a double-click on a
 * text-editable element, request inline edit on the element's shadow root and
 * return `true` so the caller skips the drag. Otherwise returns `false` and the
 * drag proceeds as usual.
 */
export function maybeBeginInlineEditFromHandle(element: Element): boolean {
  const isDouble = noteElementPointerDown(element)
  if (!isDouble || !isTextEditable(element)) return false
  const root = element.getRootNode()
  if (!(root instanceof ShadowRoot)) return false
  root.dispatchEvent(new CustomEvent(BEGIN_INLINE_EDIT_EVENT, { detail: { element } }))
  return true
}
