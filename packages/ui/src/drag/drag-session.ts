/**
 * Drag session — the non-React gesture engine behind `<Handles>`. Captures
 * pre-gesture geometry on pointer-down, writes inline styles LIVE per frame via
 * the edit-history's `applyLive`, and on pointer-up commits ONE atomic entry
 * (net before/after per touched property) so undo reverts the whole gesture.
 *
 * Ported close to Pixel's `drag-session.ts` (resize axis math, rotation
 * projection) and `radius-drag.ts` (inward-diagonal projection), with three
 * adaptations spelled out in the port brief:
 *  - coordinate scale comes from `../selection/viewport` (1 in-app, kept in the
 *    math so it stays zoom-ready);
 *  - live geometry is read straight off `getBoundingClientRect()`;
 *  - commits go through the in-app `EditHistory` (`applyLive` per frame, one
 *    `commit([...changes])` on release) instead of Pixel's RPC change-reporter.
 *
 * Pixel's per-frame `setPatchSilent` machinery isn't needed: `applyLive` writes
 * without recording, and the single `commit` carries the captured pre-gesture
 * inline values as `before`. A DRAG_THRESHOLD guards against a click being read
 * as a drag — no styles are written until the pointer travels past it.
 */
import type { Change } from '../edit/edit-history'
import { getViewportScale } from '../selection/viewport'

export type HandleSide = 'top' | 'right' | 'bottom' | 'left'
export type HandleCorner = 'tl' | 'tr' | 'bl' | 'br'
export type RadiusCorner = HandleCorner

/** A click only becomes a drag after the pointer travels this many px. */
export const DRAG_THRESHOLD = 3

/** Commit hook the React layer wires to the edit-history. */
export interface Committer {
  applyLive: (target: HTMLElement, kind: Change['kind'], name: string, value: string) => void
  commit: (changes: Change[], label?: string) => void
}

interface AxisSign {
  active: boolean
  sign: 1 | -1
}

interface AxisInputs {
  width: AxisSign
  height: AxisSign
}

/** Resize axes for a given handle — which dimensions move and in which
 *  direction. Mirrors Pixel's `axesForHandle`. */
export function axesForHandle(input: { side?: HandleSide; corner?: HandleCorner }): AxisInputs {
  if (input.corner) {
    const c = input.corner
    return {
      width: { active: true, sign: c === 'tr' || c === 'br' ? 1 : -1 },
      height: { active: true, sign: c === 'bl' || c === 'br' ? 1 : -1 },
    }
  }
  switch (input.side) {
    case 'right':  return { width: { active: true, sign: 1 },   height: { active: false, sign: 1 } }
    case 'left':   return { width: { active: true, sign: -1 },  height: { active: false, sign: 1 } }
    case 'bottom': return { width: { active: false, sign: 1 },  height: { active: true, sign: 1 } }
    case 'top':    return { width: { active: false, sign: 1 },  height: { active: true, sign: -1 } }
  }
  throw new Error('axesForHandle: handle missing side or corner')
}

/** Inward unit vector at each corner — projecting pointer motion onto this axis
 *  gives the radius delta (positive = grow). The /√2 normalisation makes a
 *  diagonal pointer drag write px at screen rate. Mirrors Pixel's `INWARD`. */
const INWARD: Record<RadiusCorner, { x: number; y: number }> = {
  tl: { x:  1 / Math.SQRT2, y:  1 / Math.SQRT2 },
  tr: { x: -1 / Math.SQRT2, y:  1 / Math.SQRT2 },
  br: { x: -1 / Math.SQRT2, y: -1 / Math.SQRT2 },
  bl: { x:  1 / Math.SQRT2, y: -1 / Math.SQRT2 },
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface BaseSession {
  element: HTMLElement
  committer: Committer
  startX: number
  startY: number
  /** True once the pointer has travelled past DRAG_THRESHOLD; before that no
   *  styles are written and a release commits nothing. */
  moved: boolean
  /** Pre-gesture inline values (element.style.<prop>, '' when unset) keyed by
   *  CSS property — these become each change's `before`. */
  beforeInline: Map<string, string>
  prevDocCursor: string
  prevBodyUserSelect: string
}

interface ResizeSession extends BaseSession {
  kind: 'resize'
  axes: AxisInputs
  startWidth: number
  startHeight: number
  startLeft: number
  startTop: number
  /** Whether left/top can take effect — if computed position was `static` we
   *  promote to `relative` (recorded in the commit) so they do. */
  needsPositionPromotion: boolean
  rotationRad: number
}

interface MoveSession extends BaseSession {
  kind: 'move'
  startLeft: number
  startTop: number
  needsPositionPromotion: boolean
}

interface RadiusSession extends BaseSession {
  kind: 'radius'
  corner: RadiusCorner
  startRadius: number
  maxRadius: number
  rotationRad: number
}

type Session = ResizeSession | MoveSession | RadiusSession

let session: Session | null = null

export function isDragging(): boolean {
  return session !== null
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function readInline(el: HTMLElement, property: string): string {
  return (el.style.getPropertyValue(property) ?? '').trim()
}

function readComputed(el: HTMLElement, property: string): string {
  return getComputedStyle(el).getPropertyValue(property).trim()
}

function captureBefore(el: HTMLElement, props: readonly string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of props) map.set(p, readInline(el, p))
  return map
}

function beginCursorLock(cursor: string): { prevDocCursor: string; prevBodyUserSelect: string } {
  const docEl = document.documentElement
  const prevDocCursor = docEl.style.cursor
  docEl.style.cursor = cursor
  const prevBodyUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'
  return { prevDocCursor, prevBodyUserSelect }
}

function attachListeners(): void {
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerCancel)
  document.addEventListener('keydown', onKeyDown, true)
}

function cleanup(): void {
  if (!session) return
  document.documentElement.style.cursor = session.prevDocCursor
  document.body.style.userSelect = session.prevBodyUserSelect
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerCancel)
  document.removeEventListener('keydown', onKeyDown, true)
  session = null
  emitFrame()
}

/** Notify the React overlay (and any tooltip) so it re-measures each frame. */
function emitFrame(): void {
  document.dispatchEvent(new Event('screenshare-drag-frame'))
}

function past(el: number, by: number): boolean {
  return Math.abs(el) > by
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

export interface ResizeStartInput {
  element: HTMLElement
  committer: Committer
  side?: HandleSide
  corner?: HandleCorner
  startX: number
  startY: number
  /** Element CSS rotation (deg) — drag delta is projected into the element's
   *  local axes so resize math stays correct under rotation. */
  rotationDeg: number
  cursor: string
}

export function startResizeDrag(input: ResizeStartInput): void {
  if (session) return
  const el = input.element
  const rect = el.getBoundingClientRect()
  const scale = getViewportScale() || 1
  const axes = axesForHandle(input)

  const position = readComputed(el, 'position')
  const isStatic = position === 'static'
  const isFixed = position === 'fixed'
  // offsetLeft/Top are offsetParent-relative (what we write into left/top). For
  // fixed elements offsetParent is null → fall back to viewport coords.
  const startLeft = isFixed ? rect.left : el.offsetLeft
  const startTop = isFixed ? rect.top : el.offsetTop

  const lock = beginCursorLock(input.cursor)
  session = {
    kind: 'resize',
    element: el,
    committer: input.committer,
    startX: input.startX,
    startY: input.startY,
    moved: false,
    beforeInline: captureBefore(el, ['width', 'height', 'left', 'top', 'position']),
    axes,
    startWidth: rect.width / scale,
    startHeight: rect.height / scale,
    startLeft,
    startTop,
    needsPositionPromotion: isStatic,
    rotationRad: (input.rotationDeg * Math.PI) / 180,
    ...lock,
  }
  attachListeners()
}

function moveResize(e: PointerEvent, s: ResizeSession): void {
  const scale = getViewportScale() || 1
  const dx = (e.clientX - s.startX) / scale
  const dy = (e.clientY - s.startY) / scale

  // Project the (zoom-corrected) delta into the element's un-rotated local frame.
  const cos = Math.cos(s.rotationRad)
  const sin = Math.sin(s.rotationRad)
  const localDx = dx * cos + dy * sin
  const localDy = -dx * sin + dy * cos

  let widthDelta = 0
  let heightDelta = 0
  if (s.axes.width.active) widthDelta = Math.max(localDx * s.axes.width.sign, -s.startWidth)
  if (s.axes.height.active) heightDelta = Math.max(localDy * s.axes.height.sign, -s.startHeight)

  // Aspect-ratio lock (Shift) — only meaningful for corner drags (both axes).
  if (
    e.shiftKey &&
    s.axes.width.active &&
    s.axes.height.active &&
    s.startWidth > 0 &&
    s.startHeight > 0
  ) {
    const aspect = s.startWidth / s.startHeight
    const wRel = Math.abs(widthDelta) / s.startWidth
    const hRel = Math.abs(heightDelta) / s.startHeight
    if (wRel >= hRel) {
      heightDelta = (s.startWidth + widthDelta) / aspect - s.startHeight
    } else {
      widthDelta = (s.startHeight + heightDelta) * aspect - s.startWidth
    }
    widthDelta = Math.max(widthDelta, -s.startWidth)
    heightDelta = Math.max(heightDelta, -s.startHeight)
  }

  if (s.needsPositionPromotion && (s.axes.width.sign === -1 || s.axes.height.sign === -1)) {
    // left/top only take effect once positioned; promote to relative live.
    s.committer.applyLive(s.element, 'style', 'position', 'relative')
  }
  if (s.axes.width.active) {
    s.committer.applyLive(s.element, 'style', 'width', `${Math.round(s.startWidth + widthDelta)}px`)
    if (s.axes.width.sign === -1) {
      s.committer.applyLive(s.element, 'style', 'left', `${Math.round(s.startLeft - widthDelta)}px`)
    }
  }
  if (s.axes.height.active) {
    s.committer.applyLive(s.element, 'style', 'height', `${Math.round(s.startHeight + heightDelta)}px`)
    if (s.axes.height.sign === -1) {
      s.committer.applyLive(s.element, 'style', 'top', `${Math.round(s.startTop - heightDelta)}px`)
    }
  }
  emitFrame()
}

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

export interface MoveStartInput {
  element: HTMLElement
  committer: Committer
  startX: number
  startY: number
  cursor: string
}

export function startMoveDrag(input: MoveStartInput): void {
  if (session) return
  const el = input.element
  const rect = el.getBoundingClientRect()
  const position = readComputed(el, 'position')
  const isFixed = position === 'fixed'
  const startLeft = isFixed ? rect.left : el.offsetLeft
  const startTop = isFixed ? rect.top : el.offsetTop

  const lock = beginCursorLock(input.cursor)
  session = {
    kind: 'move',
    element: el,
    committer: input.committer,
    startX: input.startX,
    startY: input.startY,
    moved: false,
    beforeInline: captureBefore(el, ['left', 'top', 'position']),
    startLeft,
    startTop,
    needsPositionPromotion: position === 'static',
    ...lock,
  }
  attachListeners()
}

function moveReposition(e: PointerEvent, s: MoveSession): void {
  const scale = getViewportScale() || 1
  const dx = (e.clientX - s.startX) / scale
  const dy = (e.clientY - s.startY) / scale
  if (s.needsPositionPromotion) {
    s.committer.applyLive(s.element, 'style', 'position', 'relative')
  }
  s.committer.applyLive(s.element, 'style', 'left', `${Math.round(s.startLeft + dx)}px`)
  s.committer.applyLive(s.element, 'style', 'top', `${Math.round(s.startTop + dy)}px`)
  emitFrame()
}

// ---------------------------------------------------------------------------
// Corner radius
// ---------------------------------------------------------------------------

export interface RadiusStartInput {
  element: HTMLElement
  committer: Committer
  corner: RadiusCorner
  startX: number
  startY: number
  rotationDeg: number
  cursor: string
}

export function startRadiusDrag(input: RadiusStartInput): void {
  if (session) return
  const el = input.element
  const rect = el.getBoundingClientRect()
  const scale = getViewportScale() || 1
  const maxRadius = Math.min(rect.width, rect.height) / 2 / scale
  const startRadius = readPx(el, 'border-radius')

  const lock = beginCursorLock(input.cursor)
  session = {
    kind: 'radius',
    element: el,
    committer: input.committer,
    startX: input.startX,
    startY: input.startY,
    moved: false,
    beforeInline: captureBefore(el, ['border-radius']),
    corner: input.corner,
    startRadius,
    maxRadius,
    rotationRad: (input.rotationDeg * Math.PI) / 180,
    ...lock,
  }
  attachListeners()
}

function moveRadius(e: PointerEvent, s: RadiusSession): void {
  const scale = getViewportScale() || 1
  const dx = (e.clientX - s.startX) / scale
  const dy = (e.clientY - s.startY) / scale
  // Project into the un-rotated local frame so inward stays consistent.
  const cos = Math.cos(s.rotationRad)
  const sin = Math.sin(s.rotationRad)
  const localDx = dx * cos + dy * sin
  const localDy = -dx * sin + dy * cos
  const inward = INWARD[s.corner]
  const delta = localDx * inward.x + localDy * inward.y
  // √2 compensates for the /√2 in INWARD: a diagonal drag of N px grows the
  // radius by ~N px. Clamped to [0, min(W,H)/2] — CSS's geometric cap.
  const raw = Math.max(0, Math.min(s.maxRadius, s.startRadius + delta * Math.SQRT2))
  s.committer.applyLive(s.element, 'style', 'border-radius', `${Math.round(raw)}px`)
  emitFrame()
}

function readPx(el: HTMLElement, property: string): number {
  return parseFloat(readComputed(el, property)) || 0
}

// ---------------------------------------------------------------------------
// Shared lifecycle
// ---------------------------------------------------------------------------

function onPointerMove(e: PointerEvent): void {
  if (!session) return
  if (!session.moved) {
    if (!past(e.clientX - session.startX, DRAG_THRESHOLD) && !past(e.clientY - session.startY, DRAG_THRESHOLD)) {
      return
    }
    session.moved = true
  }
  if (session.kind === 'resize') return moveResize(e, session)
  if (session.kind === 'move') return moveReposition(e, session)
  if (session.kind === 'radius') return moveRadius(e, session)
}

function onPointerUp(): void {
  if (!session) return
  if (session.moved) finalizeCommit(session)
  cleanup()
}

function onPointerCancel(): void {
  if (!session) return
  revert(session)
  cleanup()
}

function onKeyDown(e: KeyboardEvent): void {
  if (!session) return
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopImmediatePropagation()
  revert(session)
  cleanup()
}

/** Net before/after per touched property → one atomic edit-history entry. */
function finalizeCommit(s: Session): void {
  const changes: Change[] = []
  for (const [name, before] of s.beforeInline) {
    const after = readInline(s.element, name)
    if (after !== before) changes.push({ target: s.element, kind: 'style', name, before, after })
  }
  if (changes.length > 0) s.committer.commit(changes, s.kind)
}

/** Escape / pointer-cancel — restore every touched property's pre-gesture
 *  inline value without recording. */
function revert(s: Session): void {
  for (const [name, before] of s.beforeInline) {
    s.committer.applyLive(s.element, 'style', name, before)
  }
}
