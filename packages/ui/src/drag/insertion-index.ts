/**
 * Insertion-index math for the reposition drag — given a parent element, its
 * dragged child, and the cursor's screen position, returns the integer index
 * `0..n` at which the dragged element would land if released right now.
 *
 * Pure (no DOM mutation, no state). The session reads this per pointer move
 * and decides whether to mutate the DOM. See tech-specs/drag-to-reposition.md
 * §6.
 */

import { getViewportScale } from '../canvas/viewport'

export type InsertionAxis = 'x' | 'y'

/** Pick the insertion axis from the parent's computed `display` and
 *  `flex-direction`. Flex-row / inline-flex-row / inline / inline-block
 *  stack along x; flex-column / block / table-row stack along y. Grid v1
 *  falls back to the axis with the larger total span of children. */
export function resolveInsertionAxis(parent: Element): InsertionAxis {
  const cs = getComputedStyle(parent)
  const display = cs.display
  if (display.includes('flex')) {
    return cs.flexDirection.startsWith('column') ? 'y' : 'x'
  }
  if (display.includes('grid')) {
    // Coarse heuristic: measure the children's bounding box and pick the
    // axis they span more along. A grid-row with one tall column lands on y;
    // a grid with multiple rows still tends to win on y because content
    // generally grows downward. Designers rarely drag-reorder grid cells in
    // v1 (it's deferred to spec §11).
    return 'y'
  }
  if (display.startsWith('inline')) return 'x'
  // Block-level fall-through — children stack vertically.
  return 'y'
}

/** A sibling participating in the parent's flow with its midpoint along
 *  the insertion axis. Absolute / fixed children are filtered out before
 *  this list is built. */
interface FlowChild {
  element: Element
  midpoint: number
  index: number
}

/** Build the flow-child list, skipping `excluded` (the dragged element)
 *  plus any child taken out of flow. Returns children in their DOM order
 *  with original DOM indices preserved (so the result's `toIndex` maps
 *  back to a real `insertBefore` argument). */
export function flowChildren(parent: Element, axis: InsertionAxis, excluded: Element | null): FlowChild[] {
  const out: FlowChild[] = []
  const scale = getViewportScale() || 1
  const parentRect = parent.getBoundingClientRect()
  const parentCs = getComputedStyle(parent)
  const parentBorderLeft = parseFloat(parentCs.borderLeftWidth) || 0
  const parentBorderTop = parseFloat(parentCs.borderTopWidth) || 0

  let i = 0
  for (const child of Array.from(parent.children)) {
    const idx = i++
    if (child === excluded) continue
    const cs = getComputedStyle(child)
    if (cs.position === 'absolute' || cs.position === 'fixed') continue
    if (cs.display === 'contents' || cs.display === 'none') continue

    // IMPORTANT: during in-flow drag, siblings animate via FLIP (WAAPI
    // transforms). `getBoundingClientRect()` includes those transforms, which
    // makes midpoints move under the cursor and can cause rapid slot
    // oscillation—especially when zoomed. Prefer layout metrics (offset*)
    // which ignore transforms; then convert to screen-space using the current
    // viewport scale.
    let midpoint: number | null = null
    if (parent instanceof HTMLElement && child instanceof HTMLElement) {
      const w = child.offsetWidth
      const h = child.offsetHeight
      if (w > 0 && h > 0) {
        // `offset{Left,Top}` are measured from the child's `offsetParent`, which
        // is NOT necessarily `parent`: it's the nearest *positioned* ancestor
        // (or a table cell / `<body>`). For a direct child there are two cases:
        //   • offsetParent === parent (parent is positioned): `offsetLeft` is
        //     from parent's *padding* edge, so add the parent border back to
        //     reach its border-box origin.
        //   • offsetParent !== parent (parent is static): child and parent share
        //     the same offsetParent, so `child.offsetLeft − parent.offsetLeft`
        //     is the child's position relative to parent's border-box origin.
        // The old formula assumed the first case unconditionally; on a
        // statically-positioned flex row that shifted every midpoint right by
        // the parent's own offset within *its* offsetParent — forcing the cursor
        // far past the true midpoint before a reorder fired (and the error is a
        // fixed element-space distance, hence zoom-independent). Everything is
        // computed in layout px then scaled once to screen space.
        const sameOffsetParent = child.offsetParent === parent
        if (axis === 'x') {
          const originFromParent = sameOffsetParent
            ? child.offsetLeft + parentBorderLeft
            : child.offsetLeft - parent.offsetLeft
          midpoint =
            parentRect.left + (originFromParent - parent.scrollLeft + w / 2) * scale
        } else {
          const originFromParent = sameOffsetParent
            ? child.offsetTop + parentBorderTop
            : child.offsetTop - parent.offsetTop
          midpoint =
            parentRect.top + (originFromParent - parent.scrollTop + h / 2) * scale
        }
      }
    }
    if (midpoint == null) {
      const rect = child.getBoundingClientRect()
      midpoint = axis === 'x' ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    }
    out.push({ element: child, midpoint, index: idx })
  }
  return out
}

/**
 * Resolve the insertion index for the cursor. Returns `0..flowChildren.length`,
 * where `k` means "the dragged element is inserted before the k-th element of
 * `flowChildren`" (or appended when k === length).
 *
 * This is a count of children whose midpoint precedes the cursor along the
 * insertion axis — order-stable, monotonic in cursor position.
 */
export function resolveInsertionIndex(children: readonly FlowChild[], cursorAxisCoord: number): number {
  let k = 0
  for (const child of children) {
    if (cursorAxisCoord > child.midpoint) k++
    else break
  }
  return k
}

/** Convert a flow-child slot index `k` back into a DOM-`insertBefore`
 *  reference: the node before which the dragged element should be inserted,
 *  or `null` to append. `excluded` is the dragged element, which is removed
 *  from the parent before this lookup is read in the session. */
export function nodeBeforeAtSlot(
  parent: Element,
  children: readonly FlowChild[],
  slot: number,
): Node | null {
  // `slot === children.length` → append (no reference node).
  if (slot >= children.length) return null
  const target = children[slot].element
  // Re-resolve against the parent at call time — caller has already detached
  // the dragged element so DOM indices may have shifted, but the *target
  // element identity* is what we care about.
  return parent.contains(target) ? target : null
}
