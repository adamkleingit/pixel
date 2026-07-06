/**
 * FLIP animation utility for the reposition gesture.
 *
 * Standard FLIP: capture each child's rect *before* the DOM mutation (First),
 * mutate, capture the rect *after* (Last), and animate the inverse transform
 * back to zero over a short duration so the user sees the element glide from
 * its old position to its new one.
 *
 * We use Web Animations API `el.animate(...)` (not CSS transitions) so we
 * never have to write to the inline `transform` style — which a future
 * rotate gesture might be reading. Active animations are tracked so a
 * mid-flight FLIP can be cancelled and restarted from the *current* (mid-
 * animation) rect when the cursor crosses another midpoint.
 *
 * Tech spec: tech-specs/drag-to-reposition.md §7.
 */

const DURATION_MS = 180

interface Snapshot {
  element: Element
  left: number
  top: number
}

/** Capture each child's screen-space rect — call this *before* the DOM mutation. */
export function captureRects(children: readonly Element[]): Snapshot[] {
  return children.map(element => {
    const rect = element.getBoundingClientRect()
    return { element, left: rect.left, top: rect.top }
  })
}

/**
 * Drive each tracked child from its captured `first` rect to its current
 * position via an inverse-transform animation. If a child is already
 * animating, cancel it and re-start from where it visually is right now
 * (so the motion stays continuous when the cursor crosses several
 * midpoints in quick succession).
 */
export function playFlip(
  firsts: readonly Snapshot[],
  active: Map<Element, Animation>,
): void {
  for (const first of firsts) {
    const rect = first.element.getBoundingClientRect()
    const dx = first.left - rect.left
    const dy = first.top - rect.top
    if (dx === 0 && dy === 0) {
      // Element didn't move — nothing to animate; cancel any in-flight FLIP
      // so we don't leave a phantom transform lingering.
      const prev = active.get(first.element)
      if (prev) {
        prev.cancel()
        active.delete(first.element)
      }
      continue
    }

    // Cancel any previous FLIP for this element so it doesn't fight the new one.
    const prev = active.get(first.element)
    if (prev) prev.cancel()

    const anim = (first.element as HTMLElement).animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: DURATION_MS, easing: 'ease-out', fill: 'none' },
    )
    active.set(first.element, anim)
    anim.addEventListener('finish', () => {
      if (active.get(first.element) === anim) active.delete(first.element)
    })
    anim.addEventListener('cancel', () => {
      if (active.get(first.element) === anim) active.delete(first.element)
    })
  }
}

/** Cancel every tracked animation (call on gesture cleanup / revert). */
export function cancelAll(active: Map<Element, Animation>): void {
  for (const anim of active.values()) anim.cancel()
  active.clear()
}
