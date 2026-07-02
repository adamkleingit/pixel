/**
 * Keep Pixel's own UI from tripping the app's click-outside handlers.
 *
 * App dialogs/popovers commonly dismiss on a document-level `pointerdown` /
 * `mousedown` whose target is outside their panel. A click inside Pixel's pane,
 * bar, or a portaled menu is "outside" that panel, so without containment it
 * closes the app's dialog out from under the user.
 *
 * We stop those events at the Pixel container node, in the **bubble** phase:
 * the event still reaches Pixel's own button/input (target phase fires first),
 * then stops before it can bubble on to `document`. This is order-independent —
 * unlike a shared document listener it doesn't depend on who registered first.
 *
 * We intentionally do NOT stop `click`: Pixel's buttons fire on React's
 * synthetic onClick (delegated at the React root), and outside-click libraries
 * key off pointer/mouse-down anyway. Capture-phase document listeners (rare)
 * fire before the event reaches the container and can't be contained here.
 *
 * `containEscape` additionally stops `Escape` keydown/keyup — wanted for the bar
 * (so Esc on a focused bar button doesn't close an app dialog) but NOT for
 * portaled menus, whose own Esc-to-close handler listens on `window`.
 */
import { useEffect, useRef, type RefObject } from 'react'

const POINTER_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const

/** Attach containment to an existing node; returns a cleanup fn. Use from an
 *  open-gated effect for portaled menus (whose root mounts when they open). */
export function attachContainment(node: HTMLElement, containEscape = false): () => void {
  const stop = (e: Event) => e.stopPropagation()
  const stopEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') e.stopPropagation()
  }
  for (const t of POINTER_EVENTS) node.addEventListener(t, stop)
  if (containEscape) {
    node.addEventListener('keydown', stopEscape)
    node.addEventListener('keyup', stopEscape)
  }
  return () => {
    for (const t of POINTER_EVENTS) node.removeEventListener(t, stop)
    if (containEscape) {
      node.removeEventListener('keydown', stopEscape)
      node.removeEventListener('keyup', stopEscape)
    }
  }
}

/** Ref to attach to a Pixel container (bar, pane) so its pointer/mouse events
 *  don't bubble to the app's document-level click-outside handlers. */
export function useContainEvents<T extends HTMLElement>(containEscape = false): RefObject<T> {
  // `useRef<T>(null)` resolves to the RefObject<T> overload (assignable to JSX
  // `ref`); `current` is null at runtime until mounted, hence the guard below.
  const ref = useRef<T>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    return attachContainment(node, containEscape)
  }, [containEscape])
  return ref
}
