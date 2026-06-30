/**
 * Corner-radius drag — Figma-style per-corner radius adjustment by dragging
 * the four inset dots inside the element.
 *
 * Sibling of `spacing-drag` (same lifecycle: silent inline writes per frame,
 * one change-reporter batch on pointer up, modifier-aware mirror set, lazy
 * pre-drag capture per touched property, full revert on Escape).
 *
 * **Mirror set:**
 *  - Plain drag — only this corner's longhand is written.
 *  - **Alt / Option** — all four corners are written to the same value, the
 *    way the user resizes all corners at once in Figma.
 *
 * The drag projects the pointer's local-frame motion onto the corner's inward
 * diagonal so a 45° drag toward the centre grows the radius at screen rate;
 * dragging along a single axis still works (projected magnitude). Clamped to
 * `[0, min(width, height) / 2]` — the geometric cap CSS already enforces on
 * the rendered radius.
 */

import type { Change } from '../agent-client'
import { getViewportScale } from '../canvas/viewport'
import { commitChangeBatch } from '../edit/change-reporter'
import { applyPatch, setPatchSilent, type Patch } from '../edit/patch'
import { tokenSourceFor } from '../properties-sidebar/token-mapping'
import {
  getSnapTargets,
  matchTokenForValue,
  snapModeFromEvent,
  snapToTargets,
  type SnapTarget,
} from './token-snap'

export type RadiusCorner = 'tl' | 'tr' | 'br' | 'bl'

const CORNER_PROPERTY: Record<RadiusCorner, string> = {
  tl: 'border-top-left-radius',
  tr: 'border-top-right-radius',
  br: 'border-bottom-right-radius',
  bl: 'border-bottom-left-radius',
}

/** Inward unit vector at each corner — projecting pointer motion onto this
 *  axis gives the radius delta (positive = grow). The /√2 normalisation makes
 *  a diagonal pointer drag write px at screen rate. */
const INWARD: Record<RadiusCorner, { x: number; y: number }> = {
  tl: { x:  1 / Math.SQRT2, y:  1 / Math.SQRT2 },
  tr: { x: -1 / Math.SQRT2, y:  1 / Math.SQRT2 },
  br: { x: -1 / Math.SQRT2, y: -1 / Math.SQRT2 },
  bl: { x:  1 / Math.SQRT2, y: -1 / Math.SQRT2 },
}

const ALL_CORNERS: readonly RadiusCorner[] = ['tl', 'tr', 'br', 'bl']

interface RadiusSession {
  element: HTMLElement
  peers: HTMLElement[]
  /** Corner the user grabbed. Drives the mirror set under alt. */
  baseCorner: RadiusCorner
  /** Initial pointer screen coords. */
  startX: number
  startY: number
  /** Element rotation in radians at drag start — pointer delta is projected
   *  into the un-rotated local frame before measuring inward distance. */
  rotationRad: number
  /** Starting radius (px) on the grabbed corner. The other corners' starts
   *  are lazy-read via `captureFor` the first time they enter the mirror set. */
  startRadius: number
  /** Geometric cap — CSS clips radius to half the shorter side. */
  maxRadius: number
  /** Project radius tokens, captured at gesture start. Empty when none. */
  snapTargets: SnapTarget[]
  /** Last un-snapped radius, so a mid-drag modifier change re-snaps from the
   *  raw cursor value rather than the already-snapped one. */
  lastRaw: number
  /** Lazy pre-drag inline + resolved values per touched property. */
  previousInline: Map<string, string>
  previousResolved: Map<string, string>
  peerPreviousInline: Map<HTMLElement, Map<string, string>>
  touched: Set<string>
  /** Active mirror set this frame — chrome reads this to label every mirrored
   *  dot with the live value. */
  activeCorners: RadiusCorner[]
  /** Latest written radius (px), shared across every corner in the active set
   *  by construction. Exposed for the hover/drag tooltip. */
  liveRadius: number
  htmlBefore: string
  prevDocCursor: string
  prevBodyUserSelect: string
}

let session: RadiusSession | null = null

export function isRadiusDragging(): boolean {
  return session !== null
}

/** Live drag info for the chrome — which element + corners are being driven
 *  this frame, and the current shared value. Returns null when no drag is
 *  active. Mirrors `getActiveSpacingDrag`. */
export function getActiveRadiusDrag(): {
  element: HTMLElement
  corners: Set<RadiusCorner>
  baseCorner: RadiusCorner
  value: number
} | null {
  if (!session) return null
  return {
    element: session.element,
    corners: new Set(session.activeCorners),
    baseCorner: session.baseCorner,
    value: session.liveRadius,
  }
}

interface RadiusStartInput {
  element: HTMLElement
  corner: RadiusCorner
  startX: number
  startY: number
  /** Element's CSS rotation in degrees — pointer motion is projected into the
   *  un-rotated local frame so the inward direction stays correct. */
  rotationDeg: number
  cursor: string
  peers?: readonly HTMLElement[]
}

export function startRadiusDrag(input: RadiusStartInput): void {
  if (session) return
  const el = input.element
  const rect = el.getBoundingClientRect()
  const scale = getViewportScale() || 1
  // `rect.{width,height}` are in scaled screen space; the radius cap is in
  // element CSS px, so divide back out.
  const maxRadius = Math.min(rect.width, rect.height) / 2 / scale

  const startProp = CORNER_PROPERTY[input.corner]
  const startRadius =
    parseFloat(readComputed(el, startProp)) ||
    parseFloat(readInline(el, startProp)) ||
    0

  setPatchSilent(true)
  const docEl = document.documentElement
  const prevDocCursor = docEl.style.cursor
  docEl.style.cursor = input.cursor
  const prevBodyUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'

  const rootNode = el.getRootNode()
  const htmlBefore = rootNode instanceof ShadowRoot ? rootNode.innerHTML : ''

  const peers: HTMLElement[] = []
  const peerPreviousInline = new Map<HTMLElement, Map<string, string>>()
  for (const peer of input.peers ?? []) {
    if (peer === el) continue
    peers.push(peer)
    peerPreviousInline.set(peer, new Map())
  }

  session = {
    element: el,
    peers,
    baseCorner: input.corner,
    startX: input.startX,
    startY: input.startY,
    rotationRad: (input.rotationDeg * Math.PI) / 180,
    startRadius,
    maxRadius,
    snapTargets: getSnapTargets('radius'),
    lastRaw: startRadius,
    previousInline: new Map(),
    previousResolved: new Map(),
    peerPreviousInline,
    touched: new Set(),
    activeCorners: [input.corner],
    liveRadius: startRadius,
    htmlBefore,
    prevDocCursor,
    prevBodyUserSelect,
  }

  // Capture the base corner's pre-drag value now so a zero-movement release
  // still produces a complete previousResolved → newValue change record.
  captureFor(session, startProp)

  attachListeners()
  emitFrame()
}

function attachListeners(): void {
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerCancel)
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('keyup', onKeyDown, true)
}

function onPointerMove(e: PointerEvent): void {
  if (!session) return
  const scale = getViewportScale() || 1
  // Screen-pixel delta → element-space delta (matches resize/spacing math).
  const dx = (e.clientX - session.startX) / scale
  const dy = (e.clientY - session.startY) / scale
  // Project into the un-rotated local frame so the inward direction stays
  // consistent under CSS `transform: rotate(...)`.
  const cos = Math.cos(session.rotationRad)
  const sin = Math.sin(session.rotationRad)
  const localDx = dx * cos + dy * sin
  const localDy = -dx * sin + dy * cos
  // Inward projection at the grabbed corner — diagonal drag toward centre is
  // positive, drag back outward is negative.
  const inward = INWARD[session.baseCorner]
  const delta = localDx * inward.x + localDy * inward.y
  // sqrt(2) compensates for the /√2 normalisation in INWARD: a diagonal drag
  // of N screen px should grow the radius by ~N px, not N/√2 px.
  const raw = Math.max(
    0,
    Math.min(session.maxRadius, session.startRadius + delta * Math.SQRT2),
  )
  session.lastRaw = raw
  applyToActiveSet(session, e.altKey, snapValue(session, raw, e))
  emitFrame()
}

function onKeyDown(e: KeyboardEvent): void {
  if (!session) return
  if (e.key === 'Escape' && e.type === 'keydown') {
    e.preventDefault()
    e.stopImmediatePropagation()
    revert()
    cleanup()
    return
  }
  // Re-evaluate the instant alt (mirror set) or shift/⌘ (snap mode) flips — no
  // pointermove required, so the chrome updates immediately. Re-snap from the
  // last raw cursor value so the new mode applies cleanly.
  if (e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control') {
    applyToActiveSet(session, e.altKey, snapValue(session, session.lastRaw, e))
    emitFrame()
  }
}

/** Snap a raw radius to the radius tokens per the live modifier mode, clamped
 *  and rounded to whole px. */
function snapValue(s: RadiusSession, raw: number, e: PointerEvent | KeyboardEvent): number {
  const mode = snapModeFromEvent(e)
  const { value } = snapToTargets(raw, s.snapTargets, mode)
  return Math.max(0, Math.min(s.maxRadius, Math.round(value)))
}

function applyToActiveSet(s: RadiusSession, alt: boolean, value: number): void {
  const corners: RadiusCorner[] = alt ? [...ALL_CORNERS] : [s.baseCorner]
  s.activeCorners = corners
  s.liveRadius = value
  const px = `${value}px`
  for (const corner of corners) {
    const property = CORNER_PROPERTY[corner]
    captureFor(s, property)
    s.touched.add(property)
    apply(s, { kind: 'setStyle', property, value: px })
  }
}

function captureFor(s: RadiusSession, property: string): void {
  if (!s.previousInline.has(property)) {
    const inline = readInline(s.element, property)
    s.previousInline.set(property, inline)
    s.previousResolved.set(property, inline || readComputed(s.element, property))
  }
  for (const peer of s.peers) {
    const map = s.peerPreviousInline.get(peer)!
    if (!map.has(property)) map.set(property, readInline(peer, property))
  }
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

function apply(s: RadiusSession, patch: Patch): void {
  applyPatch(s.element, patch)
  for (const peer of s.peers) applyPatch(peer, patch)
}

function finalizeCommit(): void {
  if (!session) return
  setPatchSilent(false)
  const changes: Change[] = []
  for (const property of session.touched) {
    const previousValue = session.previousResolved.get(property) ?? ''
    const newValue =
      readInline(session.element, property) ||
      readComputed(session.element, property)
    // When the final radius coincides with a token (the drag snapped to it),
    // bind it so the agent writes the symbolic spelling, not the raw px.
    const token = matchTokenForValue(newValue, session.snapTargets)
    changes.push({
      property,
      previousValue,
      newValue,
      ...(token ? { source: tokenSourceFor(token, property) } : {}),
    })
  }
  if (changes.length > 0) {
    commitChangeBatch({
      element: session.element,
      htmlBefore: session.htmlBefore,
      changes,
    })
  }
}

function revert(): void {
  if (!session) return
  setPatchSilent(true)
  for (const property of session.touched) {
    applyPatch(session.element, {
      kind: 'setStyle',
      property,
      value: session.previousInline.get(property) ?? '',
    })
    for (const peer of session.peers) {
      const map = session.peerPreviousInline.get(peer)
      if (!map) continue
      applyPatch(peer, {
        kind: 'setStyle',
        property,
        value: map.get(property) ?? '',
      })
    }
  }
  setPatchSilent(false)
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
  document.removeEventListener('keyup', onKeyDown, true)
  session = null
  emitFrame()
}

function emitFrame(): void {
  document.dispatchEvent(new Event('pixel-drag-frame'))
}

function readInline(el: Element, property: string): string {
  return ((el as HTMLElement).style?.getPropertyValue(property) ?? '').trim()
}

function readComputed(el: Element, property: string): string {
  return getComputedStyle(el).getPropertyValue(property).trim()
}

export const RADIUS_CORNER_PROPERTIES = CORNER_PROPERTY
