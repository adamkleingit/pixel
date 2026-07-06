/**
 * Spacing drag — a lightweight sibling of `drag-session` for dragging a single
 * box-spacing value (padding / margin / flex gap) directly on the canvas, the
 * way Figma's spacing handles work.
 *
 * Same lifecycle contract as the resize/rotate session: mutate inline style per
 * frame in silent mode, mirror onto multi-edit peers, then commit one
 * change-reporter batch (previous → final) on pointer up. Escape / pointer
 * cancel reverts every captured pre-drag inline value.
 *
 * **Modifier-aware mirror set (Figma):**
 *  - Plain drag — writes only the source property.
 *  - **Alt / Option** — also writes the opposite side (top↔bottom, left↔right);
 *    for gaps, locks row-gap + column-gap together.
 *  - **Alt + Shift** — writes all four sides of the same kind (padding or
 *    margin).
 * The active set is recomputed every frame from the live modifier state, so a
 * user can press / release alt mid-drag and the set widens / narrows. Sides
 * that have ever been written are remembered in `touched` so the final commit
 * batches a `previous → new` change for each.
 */

import type { Change } from '../agent-client'
import { getViewportScale } from '../canvas/viewport'
import { commitChangeBatch } from '../edit/change-reporter'
import { applyPatch, setPatchSilent, type Patch } from '../edit/patch'
import { tokenSourceFor } from '../properties-sidebar/token-mapping'
import { mirrorPropertiesFor } from './spacing-mirror'
import {
  getSnapTargets,
  matchTokenForValue,
  snapModeFromEvent,
  snapToTargets,
  type SnapTarget,
} from './token-snap'

export type SpacingAxis = 'x' | 'y'

/** Left→right (or top→bottom) order for cycling a gap through the spread modes:
 *  least spread (space-evenly) first, most spread (space-between) last. */
const SPREAD_ORDER = ['space-evenly', 'space-around', 'space-between'] as const
type SpreadMode = (typeof SPREAD_ORDER)[number]
/** px of drag along the gap axis per spread-mode step. */
const SPREAD_DRAG_STEP = 28

function isGapProperty(property: string): boolean {
  return property === 'column-gap' || property === 'row-gap'
}

/** The container's justify-content as a spread mode, or null if it's clustered. */
function readSpreadMode(el: HTMLElement): SpreadMode | null {
  const jc = getComputedStyle(el).justifyContent
  if (jc.includes('between')) return 'space-between'
  if (jc.includes('around')) return 'space-around'
  if (jc.includes('evenly')) return 'space-evenly'
  return null
}

interface SpacingSession {
  element: HTMLElement
  peers: HTMLElement[]
  /** Originally-dragged property — drives `startValue`, the value delta, and
   *  the mirror-set expansion under modifiers. */
  baseProperty: string
  axis: SpacingAxis
  /** Multiplier turning a screen-space delta along `axis` into a value delta,
   *  so e.g. dragging a bottom-padding bar upward still increases padding. */
  sign: 1 | -1
  min: number
  startCoord: number
  startValue: number
  /** Project spacing tokens, captured at gesture start. Empty when none. */
  snapTargets: SnapTarget[]
  /** Last un-snapped value, so a mid-drag modifier change (alt/shift/⌘) can
   *  re-snap from the raw cursor value rather than the already-snapped one. */
  lastRaw: number
  /** Pre-drag inline + resolved values, captured **lazily** the first time a
   *  property enters the mirror set — a side that only joins on alt-held
   *  mid-drag still gets its true pre-drag value captured for revert/commit. */
  previousInline: Map<string, string>
  previousResolved: Map<string, string>
  /** Pre-drag inline per (peer × property), captured the same way. */
  peerPreviousInline: Map<HTMLElement, Map<string, string>>
  /** Every property that has been written during this drag — needed for the
   *  final commit / revert (a side touched and then dropped from the active
   *  set still needs to be reported). */
  touched: Set<string>
  /** The mirror set active on the most recent move, exposed to the chrome. */
  activeProperties: string[]
  htmlBefore: string
  prevDocCursor: string
  prevBodyUserSelect: string
  // --- gap-on-a-spread-container: cycle justify-content instead of scrubbing px
  /** True while dragging the gap of a container whose justify-content is a
   *  spread mode — the drag cycles the modes rather than scrubbing px. Cleared
   *  (permanently, for this drag) once ⌘ converts it to an explicit px gap. */
  spread: boolean
  /** SPREAD_ORDER index of the mode at gesture start. */
  spreadStartIndex: number
  /** The spread mode written on the most recent frame (for the on-canvas label
   *  and change dedup). Null once converted to a px gap. */
  spreadMode: SpreadMode | null
  /** Last value-space delta along the axis, so a modifier keydown/keyup can
   *  re-evaluate the frame without a fresh pointer position. */
  lastDelta: number
}

let session: SpacingSession | null = null

export function isSpacingDragging(): boolean {
  return session !== null
}

/**
 * Live drag info for the chrome: which element + properties are being dragged
 * this frame (the active mirror set) and the value being written. Returns
 * `null` when no drag is active. `SpacingHandles` reads this each
 * `pixel-drag-frame` to render the value label on every mirrored bar and to
 * suppress the hover striped band on bars being driven.
 */
export function getActiveSpacingDrag(): {
  element: HTMLElement
  /** Active mirror set this frame (may shrink/grow as modifiers change). */
  properties: Set<string>
  /** The property the user originally grabbed. */
  baseProperty: string
  value: number
  /** Set while dragging a gap through the spread modes — the on-canvas label
   *  shows this instead of a px value. */
  spreadMode: SpreadMode | null
} | null {
  if (!session) return null
  const inline = readInline(session.element, session.baseProperty)
  const value =
    parseFloat(inline) ||
    parseFloat(readComputed(session.element, session.baseProperty)) ||
    0
  return {
    element: session.element,
    properties: new Set(session.activeProperties),
    baseProperty: session.baseProperty,
    value,
    spreadMode: session.spreadMode,
  }
}

interface SpacingStartInput {
  element: HTMLElement
  property: string
  axis: SpacingAxis
  sign: 1 | -1
  startX: number
  startY: number
  cursor: string
  peers?: readonly HTMLElement[]
  min?: number
}

export function startSpacingDrag(input: SpacingStartInput): void {
  if (session) return
  const el = input.element

  const startValue = parseFloat(readComputed(el, input.property)) || 0
  // Gap on a spread container → cycle justify-content instead of scrubbing px.
  const startSpread = isGapProperty(input.property) ? readSpreadMode(el) : null

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
    baseProperty: input.property,
    axis: input.axis,
    sign: input.sign,
    min: input.min ?? 0,
    startCoord: input.axis === 'x' ? input.startX : input.startY,
    startValue,
    snapTargets: getSnapTargets('spacing'),
    lastRaw: startValue,
    previousInline: new Map(),
    previousResolved: new Map(),
    peerPreviousInline,
    touched: new Set(),
    activeProperties: [input.property],
    htmlBefore,
    prevDocCursor,
    prevBodyUserSelect,
    spread: startSpread !== null,
    spreadStartIndex: startSpread ? SPREAD_ORDER.indexOf(startSpread) : 0,
    spreadMode: startSpread,
    lastDelta: 0,
  }

  // Capture the base property's pre-drag value immediately so the very first
  // commit (no movement, no modifier) still has a previousResolved to report.
  captureFor(session, input.property)
  // For a spread-gap drag we mutate justify-content — capture its pre-drag value
  // too so undo/commit and revert can restore it.
  if (startSpread) captureFor(session, 'justify-content')

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
  // Screen-pixel drag delta → element-space CSS-px delta: divide by the
  // viewport scale so dragging the same distance in screen space writes the
  // same number of CSS px at any zoom.
  const scale = getViewportScale() || 1
  const coord = session.axis === 'x' ? e.clientX : e.clientY
  const delta = ((coord - session.startCoord) / scale) * session.sign
  session.lastDelta = delta
  session.lastRaw = Math.max(session.min, session.startValue + delta)
  applyFrame(session, e, delta)
  emitFrame()
}

/** Modifier-only keydown/keyup: re-apply the current frame through the new
 *  mirror set / mode so labels and on-screen bars update the instant a modifier
 *  is pressed or released, without waiting for the next pointermove. */
function onKeyDown(e: KeyboardEvent): void {
  if (!session) return
  if (e.key === 'Escape' && e.type === 'keydown') {
    e.preventDefault()
    e.stopImmediatePropagation()
    revert()
    cleanup()
    return
  }
  if (e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control') {
    applyFrame(session, e, session.lastDelta)
    emitFrame()
  }
}

/**
 * Apply one drag frame. For a gap on a spread container (`session.spread`) a
 * plain drag cycles the spread modes along the axis (space-evenly → -around →
 * -between); holding ⌘/Ctrl converts it to an explicit px gap — clearing the
 * spread to a clustered flex-start and scrubbing the pixel value from there,
 * matching the design pane. Everything else scrubs px as before.
 */
function applyFrame(s: SpacingSession, e: PointerEvent | KeyboardEvent, delta: number): void {
  const meta = e.metaKey || e.ctrlKey
  if (s.spread && !meta) {
    const idx = Math.max(0, Math.min(SPREAD_ORDER.length - 1, s.spreadStartIndex + Math.round(delta / SPREAD_DRAG_STEP)))
    const mode = SPREAD_ORDER[idx]
    if (mode !== s.spreadMode) {
      s.spreadMode = mode
      s.touched.add('justify-content')
      apply(s, { kind: 'setStyle', property: 'justify-content', value: mode })
    }
    return
  }
  if (s.spread && meta) {
    // ⌘ pressed → leave spread for a clustered flex-start + explicit px gap,
    // then fall through to normal px scrubbing for the rest of the drag.
    s.spread = false
    s.spreadMode = null
    s.touched.add('justify-content')
    apply(s, { kind: 'setStyle', property: 'justify-content', value: 'flex-start' })
  }
  const next = snapValue(s, s.lastRaw, e)
  applyToActiveSet(s, e.altKey, e.shiftKey, next)
}

/** Snap a raw value to the spacing tokens per the live modifier mode, rounded
 *  to whole px. */
function snapValue(s: SpacingSession, raw: number, e: PointerEvent | KeyboardEvent): number {
  const mode = snapModeFromEvent(e)
  const { value } = snapToTargets(raw, s.snapTargets, mode)
  return Math.max(s.min, Math.round(value))
}

function applyToActiveSet(
  s: SpacingSession,
  alt: boolean,
  shift: boolean,
  value: number,
): void {
  const next = mirrorPropertiesFor(s.baseProperty, alt, shift)
  s.activeProperties = next
  const px = `${value}px`
  for (const property of next) {
    captureFor(s, property)
    s.touched.add(property)
    apply(s, { kind: 'setStyle', property, value: px })
  }
}

/** Lazily capture the pre-drag inline + resolved value for `property` on the
 *  source element and every peer. No-ops if already captured. */
function captureFor(s: SpacingSession, property: string): void {
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

function apply(s: SpacingSession, patch: Patch): void {
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
    // When the final value coincides with a token (the drag snapped to it),
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
      peers: session.peers,
      peerBefore: (peer, property) =>
        session!.peerPreviousInline.get(peer as HTMLElement)?.get(property) ?? '',
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
