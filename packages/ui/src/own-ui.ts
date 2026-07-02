/**
 * "Is this event ours?" — the single predicate every edit/record capture layer
 * uses to leave Pixel's own UI alone (so it doesn't block clicks on the bar,
 * panels, or menus, or mis-record them as page interactions).
 *
 * Two kinds of Pixel UI:
 *  - the in-overlay surface (bar + panes + selection chrome), all under
 *    `.screenshare-overlay`; and
 *  - menus/popovers/dropdowns **portaled to `document.body`** (so they escape the
 *    pane's clipping/stacking). Those sit OUTSIDE `.screenshare-overlay`, so the
 *    overlay-class check alone misses them — and the edit-mode click swallow
 *    would eat their item clicks, making every dropdown look "not working". They
 *    carry the `data-screenshare-ui` marker (see `OWN_UI_PROPS`) instead.
 */

/** Marker attribute placed on the root of every body-portaled Pixel menu. */
export const OWN_UI_ATTR = 'data-screenshare-ui'

/** Spread onto a portaled menu/popover root so the capture layers treat it (and
 *  its descendants) as Pixel UI: `createPortal(<div {...OWN_UI_PROPS}>…)`. */
export const OWN_UI_PROPS = { [OWN_UI_ATTR]: '' } as const

function isOwnUiElement(n: unknown): boolean {
  return (
    n instanceof Element &&
    (n.classList?.contains('screenshare-overlay') === true || n.hasAttribute?.(OWN_UI_ATTR) === true)
  )
}

/**
 * True when an event originates inside Pixel's own UI — the overlay surface or a
 * body-portaled menu. Uses `composedPath()` (so it also crosses shadow
 * boundaries), falling back to a `closest()` walk from the target.
 */
export function eventInOwnUI(e: Event): boolean {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : []
  if (path.some(isOwnUiElement)) return true
  const t = e.target
  return t instanceof Element && !!(t.closest('.screenshare-overlay') || t.closest(`[${OWN_UI_ATTR}]`))
}
