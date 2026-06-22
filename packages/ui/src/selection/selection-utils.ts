/**
 * Pure helpers for the selection model — no React, no side effects. Ported
 * near-verbatim from Pixel's `selection.utils.ts`; the only changes are the
 * coordinate seam (local `./viewport`) and dropping the inner-component label
 * helper (needs data-pixel-id, which arrives in a later phase).
 *
 * Kept separate so the depth math, target computation, and rect comparison can
 * be unit-tested against jsdom.
 */
import { getViewportScale } from './viewport'

/**
 * The container the depth/hover helpers measure against. In Pixel this was a
 * tile's ShadowRoot; in-app it's the live `document`. Only `.contains()` and
 * `parentNode` traversal are used, which all of these support.
 */
export type SelectionRoot = ShadowRoot | Document | HTMLElement

export type Rect = {
  top: number
  left: number
  width: number
  height: number
  /** CSS border-radius shorthand "tl tr br bl", read off the live element. */
  radius: string
  /** Element's own rotation in degrees, parsed out of computed `transform`. */
  rotation: number
}

/**
 * Number of element ancestors between `el` and its containing root, excluding
 * the root itself. A direct child of the root is depth 0. Returns -1 if `el` is
 * not actually inside `root`.
 */
export function depthOf(el: Element, root: SelectionRoot): number {
  if (!root.contains(el)) return -1
  let d = 0
  let cur: Node = el
  while (cur.parentNode && cur.parentNode !== root) {
    cur = cur.parentNode
    d++
  }
  return cur.parentNode === root ? d : -1
}

/**
 * Walk `el` upward to the ancestor whose depth equals `targetDepth`. If `el`
 * is shallower than `targetDepth`, returns `el` itself (capped at the deepest
 * available element on that path).
 */
export function ancestorAtDepth(
  el: Element,
  root: SelectionRoot,
  targetDepth: number,
): Element {
  const d = depthOf(el, root)
  if (d < 0) return el
  if (d <= targetDepth) return el
  let cur: Element = el
  for (let i = 0; i < d - targetDepth; i++) {
    cur = cur.parentNode as Element
  }
  return cur
}

/**
 * Pick the first element in an event's composed path that lives inside the
 * given root. Returns null if the event did not originate from within it.
 */
export function pointerElement(
  event: { composedPath(): EventTarget[] },
  root: SelectionRoot,
): Element | null {
  const path = event.composedPath()
  for (const node of path) {
    // nodeType check (not `instanceof Element`) so this works cross-realm.
    if (node && (node as Node).nodeType === 1 && root.contains(node as Node)) {
      return node as Element
    }
  }
  return null
}

/**
 * Depth of the current selection within `root`, or null if nothing is selected
 * or the selection no longer lives in the tree.
 */
export function selectionDepth(
  selection: Element | null,
  root: SelectionRoot,
): number | null {
  if (!selection || !root.contains(selection)) return null
  return depthOf(selection, root)
}

/**
 * Hover highlight target — depth-anchored to the current selection:
 *   - No selection: highlight the depth-0 ancestor of the pointer element.
 *   - Selection at depth N: highlight the depth-N ancestor of the pointer
 *     element, capped at the pointer element itself when shallower.
 */
export function computeHoverTarget(
  pointerEl: Element,
  root: SelectionRoot,
  selection: Element | null,
): Element {
  const sd = selectionDepth(selection, root)
  return ancestorAtDepth(pointerEl, root, sd ?? 0)
}

/**
 * Double-click drill target — one level deeper than the current selection.
 * With no selection, this selects depth 0 (the outermost element on the
 * pointer path). Caps at the pointer element's own depth if nothing deeper is
 * available.
 */
export function computeDrillTarget(
  pointerEl: Element,
  root: SelectionRoot,
  selection: Element | null,
): Element {
  const sd = selectionDepth(selection, root)
  return ancestorAtDepth(pointerEl, root, (sd ?? -1) + 1)
}

export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  // `getBoundingClientRect()` returns the AABB of the rotated element, which is
  // too wide for rotated elements. Use the layout box (offsetWidth/Height) for
  // the un-rotated dimensions, and recover the top-left from the bounding
  // rect's center — rotation around the default 50% 50% origin keeps element
  // center == AABB center. `getViewportScale()` is 1 in-app (no canvas zoom).
  const scale = getViewportScale() || 1
  const html = el as HTMLElement
  const width = (html.offsetWidth || r.width / scale) * scale
  const height = (html.offsetHeight || r.height / scale) * scale
  const centerX = r.left + r.width / 2
  const centerY = r.top + r.height / 2
  const cs = getComputedStyle(el)
  const radius = scaleRadius(
    `${cs.borderTopLeftRadius} ${cs.borderTopRightRadius} ` +
      `${cs.borderBottomRightRadius} ${cs.borderBottomLeftRadius}`,
    scale,
  )
  const rotation = parseRotationDeg(cs.transform)
  return {
    top: centerY - height / 2,
    left: centerX - width / 2,
    width,
    height,
    radius,
    rotation,
  }
}

/** Scale the px lengths in a border-radius shorthand to match the zoomed box. */
function scaleRadius(radius: string, scale: number): string {
  if (scale === 1) return radius
  return radius.replace(/(\d*\.?\d+)px/g, (_, n) => `${parseFloat(n) * scale}px`)
}

function parseRotationDeg(transform: string): number {
  if (!transform || transform === 'none') return 0
  const match = transform.match(/matrix\(([^)]+)\)/)
  if (!match) return 0
  const [a, b] = match[1].split(',').map(s => parseFloat(s.trim()))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return (Math.atan2(b, a) * 180) / Math.PI
}

export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.radius === b.radius &&
    a.rotation === b.rotation
  )
}
