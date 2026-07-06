/**
 * Alignment snapping — Figma-style "smart guides." While an element is moved or
 * resized, its edges/centers snap to nearby elements' edges/centers within a
 * small screen-pixel threshold, and a guide line is drawn along each active
 * alignment.
 *
 * Everything here is in **screen (viewport) pixels** — the same space as
 * `getBoundingClientRect()`. Callers that write element-space CSS convert the
 * returned correction back out by the viewport scale.
 *
 * Pure except for a tiny module-level store of the currently-active guides,
 * which the `SnapGuides` overlay reads each `pixel-drag-frame` (the same pattern
 * as `reposition-drag`'s insertion line).
 */

export const SNAP_THRESHOLD = 3 // screen px — the distance within which edges snap

export interface SnapRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** A guide line to render: a vertical (`x`) or horizontal (`y`) rule spanning
 *  `[start, end]` on the perpendicular axis (screen px). */
export interface AlignGuide {
  axis: 'x' | 'y'
  position: number
  start: number
  end: number
}

/** A candidate vertical alignment (left / center-x / right of some element). */
interface VLine {
  x: number
  top: number
  bottom: number
}
/** A candidate horizontal alignment (top / center-y / bottom of some element). */
interface HLine {
  y: number
  left: number
  right: number
}

export interface SnapModel {
  vlines: VLine[]
  hlines: HLine[]
}

const MIN_SIZE = 1

function screenRect(el: Element): SnapRect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

function isCandidate(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility === 'hidden') return false
  const r = el.getBoundingClientRect()
  return r.width >= MIN_SIZE && r.height >= MIN_SIZE
}

function pushRect(model: SnapModel, r: SnapRect): void {
  const cx = (r.left + r.right) / 2
  const cy = (r.top + r.bottom) / 2
  for (const x of [r.left, cx, r.right]) model.vlines.push({ x, top: r.top, bottom: r.bottom })
  for (const y of [r.top, cy, r.bottom]) model.hlines.push({ y, left: r.left, right: r.right })
}

/**
 * Build the snap model for `element`: the edges/centers of its in-flow siblings
 * plus its parent container. Captured once at gesture start (siblings don't move
 * while a single absolute element is dragged/resized). Screen px.
 */
export function collectSnapModel(element: HTMLElement): SnapModel {
  const model: SnapModel = { vlines: [], hlines: [] }
  const parent = element.parentElement
  if (!parent) return model
  for (const sib of Array.from(parent.children)) {
    if (sib === element) continue
    if (!isCandidate(sib)) continue
    pushRect(model, screenRect(sib))
  }
  if (isCandidate(parent)) pushRect(model, screenRect(parent))
  return model
}

/** Which edges/centers of the moving rect to test. Omit an axis's array to use
 *  its default (left/center/right or top/center/bottom) — that's the move case;
 *  resize passes only the edge(s) actually being dragged. */
export interface SnapProbes {
  xs?: number[]
  ys?: number[]
}

export interface SnapResult {
  /** Screen-px correction to apply along each axis so the best probe aligns. */
  dx: number
  dy: number
  guides: AlignGuide[]
}

function bestSnap(
  probes: number[],
  lines: Array<{ pos: number; a: number; b: number }>,
  threshold: number,
): { delta: number; pos: number; a: number; b: number } | null {
  let best: { delta: number; pos: number; a: number; b: number } | null = null
  for (const p of probes) {
    for (const line of lines) {
      const delta = line.pos - p
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, pos: line.pos, a: line.a, b: line.b }
      }
    }
  }
  return best
}

/**
 * Resolve the best snap for `moving` against `model`. Returns the screen-px
 * correction on each axis (0 when nothing is within `threshold`) and the guide
 * lines to draw. Axes are independent.
 */
export function computeSnap(
  moving: SnapRect,
  model: SnapModel,
  threshold = SNAP_THRESHOLD,
  probes: SnapProbes = {},
): SnapResult {
  const cx = (moving.left + moving.right) / 2
  const cy = (moving.top + moving.bottom) / 2
  const xs = probes.xs ?? [moving.left, cx, moving.right]
  const ys = probes.ys ?? [moving.top, cy, moving.bottom]

  const bx = bestSnap(xs, model.vlines.map((l) => ({ pos: l.x, a: l.top, b: l.bottom })), threshold)
  const by = bestSnap(ys, model.hlines.map((l) => ({ pos: l.y, a: l.left, b: l.right })), threshold)

  const dx = bx ? bx.delta : 0
  const dy = by ? by.delta : 0
  const snapped: SnapRect = {
    left: moving.left + dx,
    top: moving.top + dy,
    right: moving.right + dx,
    bottom: moving.bottom + dy,
  }

  const guides: AlignGuide[] = []
  if (bx) {
    guides.push({
      axis: 'x',
      position: bx.pos,
      start: Math.min(snapped.top, bx.a),
      end: Math.max(snapped.bottom, bx.b),
    })
  }
  if (by) {
    guides.push({
      axis: 'y',
      position: by.pos,
      start: Math.min(snapped.left, by.a),
      end: Math.max(snapped.right, by.b),
    })
  }
  return { dx, dy, guides }
}

// ---------------------------------------------------------------------------
// Active-guides store — read by the SnapGuides overlay each pixel-drag-frame.
// ---------------------------------------------------------------------------

let activeGuides: AlignGuide[] = []

export function setActiveGuides(guides: AlignGuide[]): void {
  activeGuides = guides
}

export function getActiveGuides(): AlignGuide[] {
  return activeGuides
}

export function clearActiveGuides(): void {
  activeGuides = []
}
