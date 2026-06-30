/**
 * Drag session — captures pre-drag state, mutates inline styles per frame in
 * silent mode, and on pointer up commits one change-reporter batch with
 * `(previousValue → finalValue)`.
 *
 * Two gestures share this plumbing:
 *  - Resize: writes `width`/`height` (+ `top`/`left` for out-of-flow boxes).
 *    See tech-specs/drag-to-resize.md §5.1.
 *  - Rotate: writes `transform: rotate(Ndeg)`. See §5.2.
 *
 * Cmd is captured at pointer-down to choose between modes; once started the
 * gesture runs to completion regardless of further key state. Shift, Alt etc.
 * are read live off the move event.
 */

import type { Change } from '../agent-client'
import { getViewportScale } from '../canvas/viewport'
import { commitChangeBatch } from '../edit/change-reporter'
import { applyPatch, setPatchSilent, type Patch } from '../edit/patch'
import { readRotationDeg } from '../edit/read-computed'
import type { HandleCorner, HandleSide } from './handle-layout'
import { snapModeFromEvent, snapToStep } from './token-snap'

interface AxisSign {
  active: boolean
  sign: 1 | -1
}

interface AxisInputs {
  width: AxisSign
  height: AxisSign
}

interface BaseFields {
  element: HTMLElement
  /** Peers (matched elements in other tiles) that mirror every per-frame
   *  patch. Empty in single-edit; non-empty when the gesture started under
   *  multi-edit. The agent-side fan-out for the source rewrite happens via
   *  `commitChangeBatch` reading the live `variants` scope. */
  peers: readonly HTMLElement[]
  /** Per-peer pre-drag inline values, captured at gesture start, so a
   *  cancellation can restore exactly what was on each peer (mirroring the
   *  source's previous-inline tracking). Keyed by CSS property name. */
  peerPreviousInline: Map<HTMLElement, Map<string, string>>
  htmlBefore: string
  prevDocCursor: string
  prevBodyUserSelect: string
}

interface ResizeFields {
  kind: 'resize'
  axes: AxisInputs
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  previousWidthInline: string
  previousHeightInline: string
  previousTopInline: string
  previousLeftInline: string
  previousWidthResolved: string
  previousHeightResolved: string
  previousTopResolved: string
  previousLeftResolved: string
  outOfFlow: boolean
  startTop: number
  startLeft: number
  rotationRad: number
}

interface RotateFields {
  kind: 'rotate'
  /** Element center in screen coords — pivot for the rotate gesture. */
  centerX: number
  centerY: number
  /** Angle from center to initial cursor, in radians. */
  startAngleRad: number
  /** Element's rotation in degrees at gesture start. */
  startRotationDeg: number
  /** Latest written rotation (deg), updated every frame. Exposed via
   *  `getActiveRotateDrag()` so the chrome can render a live tooltip. */
  liveRotationDeg: number
  previousTransformInline: string
  previousTransformResolved: string
}

type ActiveSession = BaseFields & (ResizeFields | RotateFields)

let session: ActiveSession | null = null

export function isDragging(): boolean {
  return session !== null
}

/** Live rotate-drag info for the chrome — element + current angle (deg).
 *  Returns null when no rotate drag is active. The rotate handles read this
 *  each `pixel-drag-frame` to render a live "Rotate {n}°" tooltip. */
export function getActiveRotateDrag(): {
  element: HTMLElement
  rotationDeg: number
} | null {
  if (!session || session.kind !== 'rotate') return null
  return { element: session.element, rotationDeg: session.liveRotationDeg }
}

export function axesForHandle(input: { side?: HandleSide; corner?: HandleCorner }): AxisInputs {
  if (input.corner) {
    const c = input.corner
    return {
      width: { active: true, sign: c === 'tr' || c === 'br' ? 1 : -1 },
      height: { active: true, sign: c === 'bl' || c === 'br' ? 1 : -1 },
    }
  }
  switch (input.side) {
    case 'right':  return { width:  { active: true, sign: 1 },  height: { active: false, sign: 1 } }
    case 'left':   return { width:  { active: true, sign: -1 }, height: { active: false, sign: 1 } }
    case 'bottom': return { width:  { active: false, sign: 1 }, height: { active: true, sign: 1 } }
    case 'top':    return { width:  { active: false, sign: 1 }, height: { active: true, sign: -1 } }
  }
  throw new Error('axesForHandle: handle missing side or corner')
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

interface ResizeStartInput {
  element: HTMLElement
  side?: HandleSide
  corner?: HandleCorner
  startX: number
  startY: number
  /** CSS rotation of the element in degrees — drag delta is projected into
   *  the element's local axes so resize math is correct under rotation. */
  rotationDeg: number
  cursor: string
  peers?: readonly HTMLElement[]
}

export function startResizeDrag(input: ResizeStartInput): void {
  if (session) return

  const rect = input.element.getBoundingClientRect()
  const axes = axesForHandle(input)
  // `rect` is in scaled screen space under canvas zoom; the gesture writes
  // element-space CSS px, so convert the start dimensions back out by the
  // viewport scale (matches the per-frame delta conversion in `moveResize`).
  const scale = getViewportScale() || 1

  const previousWidthInline = readInline(input.element, 'width')
  const previousHeightInline = readInline(input.element, 'height')
  const previousTopInline = readInline(input.element, 'top')
  const previousLeftInline = readInline(input.element, 'left')

  const position = readComputed(input.element, 'position')
  const outOfFlow = position === 'absolute' || position === 'fixed'
  // `offsetLeft`/`offsetTop` are offsetParent-relative for absolute, which
  // matches what we'll write into the `left`/`top` CSS properties. For
  // fixed elements offsetParent is null → fall back to viewport coords.
  const startLeft = outOfFlow && position === 'fixed' ? rect.left : input.element.offsetLeft
  const startTop = outOfFlow && position === 'fixed' ? rect.top : input.element.offsetTop

  const base = beginSession(
    input.element,
    input.cursor,
    input.peers ?? [],
    RESIZE_TRACKED_PROPS,
  )

  session = {
    ...base,
    kind: 'resize',
    axes,
    startX: input.startX,
    startY: input.startY,
    startWidth: rect.width / scale,
    startHeight: rect.height / scale,
    previousWidthInline,
    previousHeightInline,
    previousTopInline,
    previousLeftInline,
    previousWidthResolved: previousWidthInline || readComputed(input.element, 'width'),
    previousHeightResolved: previousHeightInline || readComputed(input.element, 'height'),
    previousTopResolved: previousTopInline || readComputed(input.element, 'top'),
    previousLeftResolved: previousLeftInline || readComputed(input.element, 'left'),
    outOfFlow,
    startTop,
    startLeft,
    rotationRad: (input.rotationDeg * Math.PI) / 180,
  }

  attachListeners()
  emitFrame()
}

// ---------------------------------------------------------------------------
// Rotate
// ---------------------------------------------------------------------------

interface RotateStartInput {
  element: HTMLElement
  startX: number
  startY: number
  cursor: string
  peers?: readonly HTMLElement[]
}

export function startRotateDrag(input: RotateStartInput): void {
  if (session) return

  const rect = input.element.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const startAngleRad = Math.atan2(input.startY - centerY, input.startX - centerX)
  const startRotationDeg = parseFloat(readRotationDeg(input.element)) || 0

  const previousTransformInline = readInline(input.element, 'transform')
  const previousTransformResolved =
    previousTransformInline || readComputed(input.element, 'transform')

  const base = beginSession(
    input.element,
    input.cursor,
    input.peers ?? [],
    ROTATE_TRACKED_PROPS,
  )

  session = {
    ...base,
    kind: 'rotate',
    centerX,
    centerY,
    startAngleRad,
    startRotationDeg,
    liveRotationDeg: startRotationDeg,
    previousTransformInline,
    previousTransformResolved,
  }

  attachListeners()
  emitFrame()
}

// ---------------------------------------------------------------------------
// Shared lifecycle
// ---------------------------------------------------------------------------

function beginSession(
  element: HTMLElement,
  cursor: string,
  rawPeers: readonly HTMLElement[],
  capturedProps: readonly string[],
): BaseFields {
  setPatchSilent(true)
  const docEl = document.documentElement
  const prevDocCursor = docEl.style.cursor
  docEl.style.cursor = cursor
  const prevBodyUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'

  const rootNode = element.getRootNode()
  const htmlBefore = rootNode instanceof ShadowRoot ? rootNode.innerHTML : ''

  // Snapshot each peer's pre-drag inline value for every prop the gesture
  // might touch. Cancel restores from this map; commits don't read it (the
  // agent fan-out via `variants` rewrites every selected variant's source).
  const peerPreviousInline = new Map<HTMLElement, Map<string, string>>()
  const peers: HTMLElement[] = []
  for (const peer of rawPeers) {
    if (peer === element) continue
    peers.push(peer)
    const snap = new Map<string, string>()
    for (const prop of capturedProps) snap.set(prop, readInline(peer, prop))
    peerPreviousInline.set(peer, snap)
  }

  return { element, peers, peerPreviousInline, htmlBefore, prevDocCursor, prevBodyUserSelect }
}

const RESIZE_TRACKED_PROPS = ['width', 'height', 'top', 'left'] as const
const ROTATE_TRACKED_PROPS = ['transform'] as const

/** Apply `patch` to the source AND mirror it onto every peer in silent mode
 *  so peer tiles stay visually in sync with the source. */
function applyPatchToSession(s: BaseFields, patch: Patch): void {
  applyPatch(s.element, patch)
  for (const peer of s.peers) applyPatch(peer, patch)
}

function attachListeners(): void {
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerCancel)
  // Capture phase so we beat the selection's Escape handler.
  document.addEventListener('keydown', onKeyDown, true)
}

function onPointerMove(e: PointerEvent): void {
  if (!session) return
  if (session.kind === 'resize') return moveResize(e, session)
  if (session.kind === 'rotate') return moveRotate(e, session)
}

function onPointerUp(): void {
  if (!session) return
  finalizeCommit()
  cleanup()
}

function onPointerCancel(): void {
  if (!session) return
  revert()
  cleanup()
}

function onKeyDown(e: KeyboardEvent): void {
  if (!session) return
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopImmediatePropagation()
  revert()
  cleanup()
}

function cleanup(): void {
  if (!session) return
  setPatchSilent(false)
  document.documentElement.style.cursor = session.prevDocCursor
  document.body.style.userSelect = session.prevBodyUserSelect
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerCancel)
  document.removeEventListener('keydown', onKeyDown, true)
  session = null
  emitFrame()
}

function emitFrame(): void {
  document.dispatchEvent(new Event('pixel-drag-frame'))
}

// ---------------------------------------------------------------------------
// Resize gesture
// ---------------------------------------------------------------------------

function moveResize(e: PointerEvent, s: BaseFields & ResizeFields): void {
  // Convert the screen-pixel drag delta into element space: under canvas zoom
  // `S`, the element moves `S` screen px per 1 element px, so the element-space
  // delta the inline `width`/`height` are written in is the screen delta / S.
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
  if (s.axes.width.active) {
    widthDelta = Math.max(localDx * s.axes.width.sign, -s.startWidth)
  }
  if (s.axes.height.active) {
    heightDelta = Math.max(localDy * s.axes.height.sign, -s.startHeight)
  }

  // Aspect-ratio lock — only meaningful for corner drags (both axes active).
  // For edge drags Shift is a no-op per tech-specs/drag-to-resize.md §5.1.
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
      const newW = s.startWidth + widthDelta
      heightDelta = newW / aspect - s.startHeight
    } else {
      const newH = s.startHeight + heightDelta
      widthDelta = newH * aspect - s.startWidth
    }
    // Re-clamp after coupling so neither dim goes negative.
    widthDelta = Math.max(widthDelta, -s.startWidth)
    heightDelta = Math.max(heightDelta, -s.startHeight)
  }

  if (s.axes.width.active) {
    applyPatchToSession(s, {
      kind: 'setStyle',
      property: 'width',
      value: `${Math.round(s.startWidth + widthDelta)}px`,
    })
    if (s.outOfFlow && s.axes.width.sign === -1) {
      applyPatchToSession(s, {
        kind: 'setStyle',
        property: 'left',
        value: `${Math.round(s.startLeft - widthDelta)}px`,
      })
    }
  }
  if (s.axes.height.active) {
    applyPatchToSession(s, {
      kind: 'setStyle',
      property: 'height',
      value: `${Math.round(s.startHeight + heightDelta)}px`,
    })
    if (s.outOfFlow && s.axes.height.sign === -1) {
      applyPatchToSession(s, {
        kind: 'setStyle',
        property: 'top',
        value: `${Math.round(s.startTop - heightDelta)}px`,
      })
    }
  }
  emitFrame()
}

// ---------------------------------------------------------------------------
// Rotate gesture
// ---------------------------------------------------------------------------

const ROTATE_SNAP_DEG = 15

function moveRotate(e: PointerEvent, s: BaseFields & RotateFields): void {
  const angle = Math.atan2(e.clientY - s.centerY, e.clientX - s.centerX)
  const deltaDeg = ((angle - s.startAngleRad) * 180) / Math.PI
  const raw = s.startRotationDeg + deltaDeg
  // Same modifier model as the token-snapping drags: plain drag snaps to the
  // nearest 15° within threshold, ⌘/Ctrl drags smoothly, Shift snaps only.
  const next = snapToStep(raw, ROTATE_SNAP_DEG, snapModeFromEvent(e))
  s.liveRotationDeg = next
  applyPatchToSession(s, {
    kind: 'setStyle',
    property: 'transform',
    value: `rotate(${next.toFixed(1)}deg)`,
  })
  emitFrame()
}

// ---------------------------------------------------------------------------
// Commit / revert
// ---------------------------------------------------------------------------

function finalizeCommit(): void {
  if (!session) return
  // Drop silent BEFORE reading so subsequent reporter calls would observe the
  // real DOM. We don't replay through applyPatch — we send the whole batch
  // directly via commitChangeBatch with the captured pre-drag values.
  setPatchSilent(false)

  const changes: Change[] = []
  if (session.kind === 'resize') {
    collectResizeChanges(session, changes)
  } else if (session.kind === 'rotate') {
    collectRotateChanges(session, changes)
  }
  commitChangeBatch({ element: session.element, htmlBefore: session.htmlBefore, changes })
}

function collectResizeChanges(s: BaseFields & ResizeFields, changes: Change[]): void {
  if (s.axes.width.active) {
    changes.push({
      property: 'width',
      previousValue: s.previousWidthResolved,
      newValue: readInline(s.element, 'width') || readComputed(s.element, 'width'),
    })
    if (s.outOfFlow && s.axes.width.sign === -1) {
      changes.push({
        property: 'left',
        previousValue: s.previousLeftResolved,
        newValue: readInline(s.element, 'left') || readComputed(s.element, 'left'),
      })
    }
  }
  if (s.axes.height.active) {
    changes.push({
      property: 'height',
      previousValue: s.previousHeightResolved,
      newValue: readInline(s.element, 'height') || readComputed(s.element, 'height'),
    })
    if (s.outOfFlow && s.axes.height.sign === -1) {
      changes.push({
        property: 'top',
        previousValue: s.previousTopResolved,
        newValue: readInline(s.element, 'top') || readComputed(s.element, 'top'),
      })
    }
  }
}

function collectRotateChanges(s: BaseFields & RotateFields, changes: Change[]): void {
  changes.push({
    property: 'transform',
    previousValue: s.previousTransformResolved,
    newValue: readInline(s.element, 'transform') || readComputed(s.element, 'transform'),
  })
}

function revert(): void {
  if (!session) return
  // Patches still need to mutate the DOM; we just don't want them reported.
  setPatchSilent(true)
  if (session.kind === 'resize') {
    if (session.axes.width.active) {
      applyPatch(session.element, { kind: 'setStyle', property: 'width', value: session.previousWidthInline })
      if (session.outOfFlow && session.axes.width.sign === -1) {
        applyPatch(session.element, { kind: 'setStyle', property: 'left', value: session.previousLeftInline })
      }
    }
    if (session.axes.height.active) {
      applyPatch(session.element, { kind: 'setStyle', property: 'height', value: session.previousHeightInline })
      if (session.outOfFlow && session.axes.height.sign === -1) {
        applyPatch(session.element, { kind: 'setStyle', property: 'top', value: session.previousTopInline })
      }
    }
  } else if (session.kind === 'rotate') {
    applyPatch(session.element, {
      kind: 'setStyle',
      property: 'transform',
      value: session.previousTransformInline,
    })
  }
  // Restore each peer to its captured pre-drag inline state. We revert every
  // tracked prop, including ones the source's revert path skipped (e.g. an
  // axis the source happened to leave alone), since we mutated the same set
  // for the peer when applyPatchToSession fanned out per frame.
  for (const peer of session.peers) {
    const snap = session.peerPreviousInline.get(peer)
    if (!snap) continue
    for (const [property, value] of snap) {
      applyPatch(peer, { kind: 'setStyle', property, value })
    }
  }
  setPatchSilent(false)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readInline(el: Element, property: string): string {
  return ((el as HTMLElement).style?.getPropertyValue(property) ?? '').trim()
}

function readComputed(el: Element, property: string): string {
  return getComputedStyle(el).getPropertyValue(property).trim()
}
