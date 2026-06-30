/**
 * Reposition drag — moves the *body* of a selected element under the cursor.
 *
 * The five sub-behaviors (free-absolute, free-in-flow, insertion-line,
 * toggle-to-absolute, toggle-to-in-flow) are resolved each pointer move from
 * the live modifier state, with Alt captured at gesture-start (duplicates the
 * dragged element before motion begins).
 *
 * Same silent-patch + single-commit contract as drag-session.ts: per-frame
 * DOM mutations run with the change reporter silenced, then on pointer-up we
 * emit a single commitChangeBatch with one or more (previousValue → newValue)
 * changes. Escape / pointer-cancel reverts to the captured pre-drag state.
 *
 * Tech spec: tech-specs/drag-to-reposition.md.
 */

import type { Change } from '../agent-client'
import { getViewportScale } from '../canvas/viewport'
import { commitChangeBatch } from '../edit/change-reporter'
import { applyPatch, setPatchSilent } from '../edit/patch'
import { cancelAll, captureRects, playFlip } from './flip-animate'
import {
  flowChildren,
  nodeBeforeAtSlot,
  resolveInsertionAxis,
  resolveInsertionIndex,
  type InsertionAxis,
} from './insertion-index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StartingFlow = 'in-flow' | 'absolute'

export type Mode =
  | { kind: 'free-absolute' }
  | { kind: 'free-in-flow' }
  | { kind: 'insertion-line' }
  | { kind: 'toggle-to-absolute' }
  | { kind: 'toggle-to-in-flow' }

/** Live snapshot the chrome can subscribe to (via `pixel-drag-frame`) to render
 *  the Cmd-mode insertion line at the right place. Null when no reposition
 *  drag is active. */
export interface InsertionLineInfo {
  parent: Element
  axis: InsertionAxis
  /** Screen-space coordinate (top for vertical line, left for horizontal). */
  position: number
  /** Cross-axis extent of the line. */
  start: number
  end: number
}

interface Session {
  /** The element under the user's pointer. In Alt-duplicate mode this is the
   *  clone — the original is untouched. */
  element: HTMLElement
  /** True iff `element` is a transient clone created by Alt. Determines the
   *  commit kind (duplicateNode) and the revert path (remove the clone vs
   *  restore the original's inline styles). */
  isClone: boolean
  /** The original source element, when `isClone`. Used for the commit's
   *  source-locator and as the revert anchor. */
  originalElement: HTMLElement | null

  parent: HTMLElement
  /** Pre-drag DOM index of `element` within `parent.children`. For
   *  in-flow reorders we compare the post-drag index against this. */
  startDomIndex: number

  peers: readonly HTMLElement[]
  /** Pre-drag inline values per element per CSS property, for revert. */
  previousInline: Map<HTMLElement, Map<string, string>>

  startingFlow: StartingFlow
  /** Modifiers at the moment the threshold was crossed (Alt is captured here;
   *  the rest are read live per frame from the move events). */
  startedWithAlt: boolean

  startX: number
  startY: number

  /** Pre-drag offset-relative position; the source of truth for `free-absolute`
   *  per-frame writes (regardless of whether the element started absolute or
   *  was just promoted via Ctrl this frame). */
  startLeft: number
  startTop: number

  /** Pre-drag screen-space bounding rect of the dragged element. Used by the
   *  in-flow transform-follow math to compute the desired visual position:
   *  `startElementRect.left + (cursor - startX)`. Captured before any inline
   *  transform/position is written so it reflects the source-rendered slot. */
  startElementRect: { left: number; top: number; width: number; height: number }

  htmlBefore: string
  prevDocCursor: string
  prevBodyUserSelect: string
  /** Map of currently-active FLIP animations, by sibling element. */
  flipAnimations: Map<Element, Animation>

  /** Tracks the current resolved mode so we can detect transitions
   *  (e.g. free-in-flow → toggle-to-absolute) and fire enter/exit logic. */
  currentMode: Mode

  /** Set when the gesture is in `insertion-line` mode. Reset on each frame
   *  in any other mode so the overlay clears. */
  insertionLine: InsertionLineInfo | null

  /** Captured parent `position` and whether we wrote it (when promoting an
   *  in-flow element to absolute requires `position: relative` on the
   *  parent). Used for revert and the commit's parent-targeted change. */
  parentPositionPrev: string
  parentPositionMutated: boolean

  /** When true, `cleanup()` skips its terminal `emitFrame()` — the snap WAAPI
   *  would skew `getBoundingClientRect()` back to the drop point; we already
   *  emitted at natural layout and will emit again when the animation ends. */
  deferCleanupEmit: boolean
}

let session: Session | null = null

/** Tracked properties per element, so revert can restore the pre-drag inline
 *  values regardless of which mode wrote what during the gesture. */
const TRACKED_PROPS = [
  'position', 'left', 'top', 'width', 'height',
  'opacity', 'transform', 'z-index',
] as const

/** Snap-to-slot animation duration on pointer-up — short enough to feel
 *  immediate, long enough to read as "the box settled here." Matches the
 *  FLIP duration in flip-animate.ts. */
const SNAP_MS = 180

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isRepositionDragging(): boolean {
  return session !== null
}

/** Live insertion-line info for chrome to render (Cmd mode only). */
export function getInsertionLine(): InsertionLineInfo | null {
  return session?.insertionLine ?? null
}

interface RepositionStartInput {
  element: HTMLElement
  startX: number
  startY: number
  /** Modifiers at the moment the threshold was crossed. Per spec, only Alt is
   *  captured here; the rest are re-read on every move. */
  altKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  cursor?: string
  peers?: readonly HTMLElement[]
}

export function startRepositionDrag(input: RepositionStartInput): void {
  if (session) return
  const parent = input.element.parentElement
  if (!(parent instanceof HTMLElement)) return

  const cs = getComputedStyle(input.element)
  const isAbsolute = cs.position === 'absolute' || cs.position === 'fixed'
  const startingFlow: StartingFlow = isAbsolute ? 'absolute' : 'in-flow'

  setPatchSilent(true)
  const docEl = document.documentElement
  const prevDocCursor = docEl.style.cursor
  docEl.style.cursor = input.cursor ?? 'grabbing'
  const prevBodyUserSelect = document.body.style.userSelect
  document.body.style.userSelect = 'none'

  const startDomIndex = Array.from(parent.children).indexOf(input.element)

  // Capture pre-drag inline values for the dragged element + every peer for
  // every property the gesture *might* write. Revert restores from this map.
  const previousInline = new Map<HTMLElement, Map<string, string>>()
  for (const el of [input.element, ...(input.peers ?? [])]) {
    const snap = new Map<string, string>()
    for (const prop of TRACKED_PROPS) snap.set(prop, readInline(el, prop))
    previousInline.set(el, snap)
  }

  // Out-of-flow elements expose offset{Left,Top} relative to offsetParent —
  // matches what we'll write to `left`/`top`. For `fixed` we fall back to
  // viewport coords via getBoundingClientRect (offsetParent is null).
  const rect = input.element.getBoundingClientRect()
  const startLeft = cs.position === 'fixed' ? rect.left : input.element.offsetLeft
  const startTop  = cs.position === 'fixed' ? rect.top  : input.element.offsetTop
  // Capture the source-rendered screen rect before any inline transform /
  // z-index / position is written. The in-flow transform-follow math derives
  // the desired visual top-left from this + cursor delta.
  const startElementRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }

  // Alt-duplicate: clone now, route the drag onto the clone. The original is
  // not modified — it sits at its source-rendered place and is what the agent
  // will eventually duplicate.
  const wantsClone = input.altKey
  let element: HTMLElement = input.element
  let originalElement: HTMLElement | null = null
  let isClone = false
  if (wantsClone) {
    const clone = input.element.cloneNode(true) as HTMLElement
    clone.setAttribute('data-pixel-drag-clone', 'true')
    // Place clone after the original so it sits above in the visual stack
    // (later siblings paint last in flow). For absolute mode the clone
    // overlaps the source until the cursor moves.
    if (input.element.nextSibling) {
      parent.insertBefore(clone, input.element.nextSibling)
    } else {
      parent.appendChild(clone)
    }
    // Snapshot the clone's inline state too.
    const cloneSnap = new Map<string, string>()
    for (const prop of TRACKED_PROPS) cloneSnap.set(prop, readInline(clone, prop))
    previousInline.set(clone, cloneSnap)
    originalElement = input.element
    element = clone
    isClone = true
  }

  const rootNode = element.getRootNode()
  const htmlBefore = rootNode instanceof ShadowRoot ? rootNode.innerHTML : ''

  session = {
    element,
    isClone,
    originalElement,
    parent,
    startDomIndex,
    peers: input.peers ?? [],
    previousInline,
    startingFlow,
    startedWithAlt: input.altKey,
    startX: input.startX,
    startY: input.startY,
    startLeft,
    startTop,
    startElementRect,
    htmlBefore,
    prevDocCursor,
    prevBodyUserSelect,
    flipAnimations: new Map(),
    currentMode: { kind: 'free-absolute' }, // placeholder — first move recomputes
    insertionLine: null,
    parentPositionPrev: getComputedStyle(parent).position,
    parentPositionMutated: false,
    deferCleanupEmit: false,
  }

  // In-flow drags float above siblings via z-index, which needs a non-static
  // position. `relative` is layout-neutral (doesn't shift the element's slot)
  // so it's the cheapest stacking-context fix. Skip for elements already
  // positioned (absolute/fixed/relative/sticky — their stacking context is
  // already established).
  if (startingFlow === 'in-flow') {
    if (cs.position === 'static') {
      applyPatch(element, { kind: 'setStyle', property: 'position', value: 'relative' })
    }
    applyPatch(element, { kind: 'setStyle', property: 'z-index', value: '9999' })
  }

  attachListeners()
  emitFrame()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function attachListeners(): void {
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerCancel)
  document.addEventListener('keydown', onKeyDown, true)
}

function onPointerMove(e: PointerEvent): void {
  if (!session) return
  step(session, e)
  emitFrame()
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
  const deferEmit = session.deferCleanupEmit
  cancelAll(session.flipAnimations)
  setPatchSilent(false)
  document.documentElement.style.cursor = session.prevDocCursor
  document.body.style.userSelect = session.prevBodyUserSelect
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerCancel)
  document.removeEventListener('keydown', onKeyDown, true)
  session = null
  if (!deferEmit) emitFrame()
}

function emitFrame(): void {
  document.dispatchEvent(new Event('pixel-drag-frame'))
}

// ---------------------------------------------------------------------------
// Per-frame step
// ---------------------------------------------------------------------------

function resolveMode(s: Session, e: PointerEvent): Mode {
  // Cmd dominates Ctrl per spec §4: insertion-line is always in-flow.
  if (e.metaKey || (e as PointerEvent & { metaKey: boolean }).metaKey) {
    return { kind: 'insertion-line' }
  }
  const ctrl = e.ctrlKey
  if (s.startingFlow === 'in-flow') {
    return ctrl ? { kind: 'toggle-to-absolute' } : { kind: 'free-in-flow' }
  }
  return ctrl ? { kind: 'toggle-to-in-flow' } : { kind: 'free-absolute' }
}

function step(s: Session, e: PointerEvent): void {
  const next = resolveMode(s, e)
  // Mode transitions (enter/exit) — restore visibility on leaving
  // insertion-line, ensure parent is positioned when entering toggle-to-abs,
  // etc.
  if (next.kind !== s.currentMode.kind) {
    onExitMode(s, s.currentMode)
    onEnterMode(s, next)
    s.currentMode = next
  }

  switch (next.kind) {
    case 'free-absolute':
    case 'toggle-to-absolute':
      stepAbsolute(s, e)
      break
    case 'free-in-flow':
    case 'toggle-to-in-flow':
      stepInFlow(s, e)
      break
    case 'insertion-line':
      stepInsertionLine(s, e)
      break
  }
}

function onExitMode(s: Session, mode: Mode): void {
  if (mode.kind === 'insertion-line') {
    // Restore full opacity — element returns to free-in-flow's transform-follow.
    applyOnAll(s, 'opacity', '')
    s.insertionLine = null
  }
}

function onEnterMode(s: Session, mode: Mode): void {
  if (mode.kind === 'toggle-to-absolute' && s.startingFlow === 'in-flow') {
    // Promote in-flow → absolute, preserving on-screen geometry.
    promoteToAbsolute(s)
  }
  if (mode.kind === 'toggle-to-in-flow' && s.startingFlow === 'absolute') {
    // Demote: strip position/left/top so the element falls back into flow.
    demoteToInFlow(s)
  }
  if (mode.kind === 'insertion-line') {
    // Cmd mode: element ghosts to 50% opacity but still follows the cursor.
    // Siblings stay put; the insertion line is the affordance for the drop slot.
    applyOnAll(s, 'opacity', '0.5')
  }
}

// ---------------------------------------------------------------------------
// Absolute drag
// ---------------------------------------------------------------------------

function stepAbsolute(s: Session, e: PointerEvent): void {
  const scale = getViewportScale() || 1
  let dxScreen = e.clientX - s.startX
  let dyScreen = e.clientY - s.startY

  // Shift axis-lock: drop whichever axis the cursor traveled *less* on.
  // Recomputed per frame (spec §5.4) — the locked axis follows the cursor.
  if (e.shiftKey) {
    if (Math.abs(dxScreen) >= Math.abs(dyScreen)) dyScreen = 0
    else dxScreen = 0
  }

  const dx = dxScreen / scale
  const dy = dyScreen / scale

  const left = Math.round(s.startLeft + dx)
  const top = Math.round(s.startTop + dy)

  applyOnAll(s, 'left', `${left}px`)
  applyOnAll(s, 'top', `${top}px`)
}

// ---------------------------------------------------------------------------
// In-flow drag — dragged element follows cursor via transform; siblings FLIP
// ---------------------------------------------------------------------------

function stepInFlow(s: Session, e: PointerEvent): void {
  const axis = resolveInsertionAxis(s.parent)
  const cursor = axis === 'x' ? e.clientX : e.clientY
  const children = flowChildren(s.parent, axis, s.element)

  // 1) Reorder the DOM (FLIP only the other siblings) if the cursor's slot
  //    differs from the dragged element's current DOM slot.
  if (children.length > 0) {
    const targetSlot = resolveInsertionIndex(children, cursor)
    const currentDomIndex = Array.from(s.parent.children).indexOf(s.element)
    const refNode = nodeBeforeAtSlot(s.parent, children, targetSlot)
    const refDomIndex = refNode instanceof Element
      ? Array.from(s.parent.children).indexOf(refNode)
      : s.parent.children.length

    // The two adjacent indices both correspond to "stay put" — `refDomIndex`
    // is the *insertBefore* reference, so `currentDomIndex + 1` means
    // "insert before the slot after me," i.e. no change.
    if (refDomIndex !== currentDomIndex && refDomIndex !== currentDomIndex + 1) {
      // FLIP only the *other* siblings (the dragged element gets re-pinned to
      // the cursor below, not animated). Capture before mutation, animate the
      // others to glide into their new positions.
      const others = children.map(c => c.element)
      const firsts = captureRects(others)
      s.parent.insertBefore(s.element, refNode)
      playFlip(firsts, s.flipAnimations)
    }
  }

  // 2) Re-pin the dragged element to the cursor via transform.
  followCursorViaTransform(s, e)
}

// ---------------------------------------------------------------------------
// Insertion-line (Cmd) — element ghosts at 50% opacity, follows cursor, no reorder
// ---------------------------------------------------------------------------

function stepInsertionLine(s: Session, e: PointerEvent): void {
  // Same cursor-follow as free-in-flow; the only difference is opacity (set
  // on entering this mode by onEnterMode) and that we do NOT mutate the DOM.
  followCursorViaTransform(s, e)

  // Update the insertion-line target. Cursor-axis math identical to free mode.
  const axis = resolveInsertionAxis(s.parent)
  const cursor = axis === 'x' ? e.clientX : e.clientY
  const children = flowChildren(s.parent, axis, s.element)
  const targetSlot = resolveInsertionIndex(children, cursor)

  const parentRect = s.parent.getBoundingClientRect()
  let position: number
  if (children.length === 0) {
    position = axis === 'x' ? parentRect.left : parentRect.top
  } else if (targetSlot === 0) {
    const rect = children[0].element.getBoundingClientRect()
    position = axis === 'x' ? rect.left : rect.top
  } else if (targetSlot >= children.length) {
    const rect = children[children.length - 1].element.getBoundingClientRect()
    position = axis === 'x' ? rect.right : rect.bottom
  } else {
    const before = children[targetSlot - 1].element.getBoundingClientRect()
    const after = children[targetSlot].element.getBoundingClientRect()
    if (axis === 'x') position = (before.right + after.left) / 2
    else position = (before.bottom + after.top) / 2
  }

  s.insertionLine = {
    parent: s.parent,
    axis,
    position,
    start: axis === 'x' ? parentRect.top : parentRect.left,
    end: axis === 'x' ? parentRect.bottom : parentRect.right,
  }
}

/** Pin the dragged element to the cursor by writing a `transform: translate()`
 *  whose value is `desiredVisualTopLeft − naturalSlotTopLeft` in element-space
 *  CSS px. The natural slot rect is read by briefly clearing the inline
 *  transform — cheap, one extra layout per move. */
function followCursorViaTransform(s: Session, e: PointerEvent): void {
  const scale = getViewportScale() || 1
  const desiredScreenLeft = s.startElementRect.left + (e.clientX - s.startX)
  const desiredScreenTop = s.startElementRect.top + (e.clientY - s.startY)

  const styleEl = s.element
  const prevInline = styleEl.style.transform
  styleEl.style.transform = ''
  const natural = styleEl.getBoundingClientRect()
  // Restore — applyOnAll below will overwrite with the new value. Restoring
  // first avoids a one-frame "no transform" flash if applyOnAll were skipped.
  styleEl.style.transform = prevInline

  const tx = (desiredScreenLeft - natural.left) / scale
  const ty = (desiredScreenTop - natural.top) / scale
  applyOnAll(s, 'transform', `translate(${tx}px, ${ty}px)`)
}

// ---------------------------------------------------------------------------
// Position-toggle helpers
// ---------------------------------------------------------------------------

function promoteToAbsolute(s: Session): void {
  // Ensure parent is positioned so `left`/`top` resolve against the right box.
  if (s.parentPositionPrev === 'static') {
    applyPatch(s.parent, { kind: 'setStyle', property: 'position', value: 'relative' })
    s.parentPositionMutated = true
  }
  const scale = getViewportScale() || 1
  // Measure the element's current box relative to its parent's content edge
  // (border-box, mirroring PositionSection.measureBox).
  const rect = s.element.getBoundingClientRect()
  const pRect = s.parent.getBoundingClientRect()
  const pCs = getComputedStyle(s.parent)
  const leftScreen = rect.left - pRect.left - (parseFloat(pCs.borderLeftWidth) || 0)
  const topScreen = rect.top - pRect.top - (parseFloat(pCs.borderTopWidth) || 0)
  // `left`/`top` are authored in element-space CSS px; under zoom the measured
  // screen-space delta must be divided back down.
  const left = leftScreen / scale
  const top = topScreen / scale
  applyOnAll(s, 'position', 'absolute')
  applyOnAll(s, 'left', `${Math.round(left)}px`)
  applyOnAll(s, 'top', `${Math.round(top)}px`)
  // From here on, `startLeft`/`startTop` represent where we just placed the
  // element — subsequent drag is relative to this.
  s.startLeft = left
  s.startTop = top
}

function demoteToInFlow(s: Session): void {
  // Strip position / left / top so the element returns to flow at its DOM index.
  applyOnAll(s, 'position', '')
  applyOnAll(s, 'left', '')
  applyOnAll(s, 'top', '')
}

// ---------------------------------------------------------------------------
// Apply / revert helpers
// ---------------------------------------------------------------------------

function applyOnAll(s: Session, property: string, value: string): void {
  applyPatch(s.element, { kind: 'setStyle', property, value })
  for (const peer of s.peers) {
    if (peer === s.element) continue
    applyPatch(peer, { kind: 'setStyle', property, value })
  }
}

function revert(): void {
  if (!session) return
  cancelAll(session.flipAnimations)
  setPatchSilent(true)
  // For in-flow gestures, re-pin the dragged element back to its starting
  // DOM index. Compare DOM indices that ignore the dragged element itself
  // by capturing children-without-element first.
  if (
    session.startingFlow === 'in-flow' &&
    session.element.parentElement === session.parent
  ) {
    const refIndex = session.startDomIndex
    const siblings = Array.from(session.parent.children)
    const ref = siblings[refIndex] ?? null
    if (session.element !== ref) {
      session.parent.insertBefore(session.element, ref)
    }
  }

  // For Alt clones: remove the clone outright.
  if (session.isClone && session.element.parentElement) {
    session.element.parentElement.removeChild(session.element)
  } else {
    // Restore each tracked property's pre-drag inline value on the dragged
    // element + every peer.
    for (const [el, snap] of session.previousInline) {
      for (const [property, value] of snap) {
        applyPatch(el, { kind: 'setStyle', property, value })
      }
    }
  }
  if (session.parentPositionMutated) {
    applyPatch(session.parent, {
      kind: 'setStyle',
      property: 'position',
      value: session.previousInline.get(session.element)?.get('position') ?? '',
    })
  }
  setPatchSilent(false)
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

function finalizeCommit(): void {
  if (!session) return
  const s = session

  // For in-flow gestures (free-in-flow or insertion-line) we play a snap
  // animation: glide from the cursor-anchored visual position into the
  // element's natural slot. For Cmd mode we additionally mutate the DOM to
  // the target slot first (Cmd defers reorder to release).
  let snapAnimationFrom: { dx: number; dy: number } | null = null
  if (s.currentMode.kind === 'insertion-line') {
    const axis = resolveInsertionAxis(s.parent)
    // Element's current screen rect *includes* the cursor-following transform
    // — that's the "First" rect for the snap animation.
    const visualRect = s.element.getBoundingClientRect()
    const children = flowChildren(s.parent, axis, s.element)
    // Resolve the slot from the element's transformed center along the axis —
    // it tracks the cursor 1:1 so this lands in the same slot the cursor was in.
    const cursorProxy = axis === 'x'
      ? visualRect.left + visualRect.width / 2
      : visualRect.top + visualRect.height / 2
    const targetSlot = resolveInsertionIndex(children, cursorProxy)
    const refNode = nodeBeforeAtSlot(s.parent, children, targetSlot)
    s.parent.insertBefore(s.element, refNode)
    // Clear inline transform now so the natural rect read is clean and the
    // WAAPI animation below isn't fighting an underlying inline value at the
    // moment it ends.
    s.element.style.removeProperty('transform')
    const natural = s.element.getBoundingClientRect()
    snapAnimationFrom = {
      dx: visualRect.left - natural.left,
      dy: visualRect.top - natural.top,
    }
  } else if (s.startingFlow === 'in-flow') {
    // Free-in-flow already reordered live; the snap is just transform → 0.
    const visualRect = s.element.getBoundingClientRect()
    s.element.style.removeProperty('transform')
    const natural = s.element.getBoundingClientRect()
    snapAnimationFrom = {
      dx: visualRect.left - natural.left,
      dy: visualRect.top - natural.top,
    }
  }

  // The selection overlay tracks the element via `pixel-drag-frame`. During
  // in-flow drag the last frame still measured the cursor-follow transform;
  // once we clear it the element is at its natural slot — re-measure before
  // the snap WAAPI starts so the outline doesn't linger at the drop point.
  if (snapAnimationFrom) {
    emitFrame()
  }

  // Run the snap animation in parallel with the source-write RPC below.
  // HMR may re-render before the animation finishes — fine, the element will
  // settle either way. `clearTransientStyles` strips z-index / opacity on
  // completion; transform was already cleared inline before the animation
  // ran (so its WAAPI keyframes are authoritative for the duration).
  if (snapAnimationFrom && (snapAnimationFrom.dx !== 0 || snapAnimationFrom.dy !== 0)) {
    s.deferCleanupEmit = true
    const anim = s.element.animate(
      [
        { transform: `translate(${snapAnimationFrom.dx}px, ${snapAnimationFrom.dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: SNAP_MS, easing: 'ease-out', fill: 'none' },
    )
    const el = s.element
    const peers = s.peers
    const onSnapEnd = () => {
      clearTransientStyles(el, peers)
      emitFrame()
    }
    anim.addEventListener('finish', onSnapEnd)
    anim.addEventListener('cancel', onSnapEnd)
  } else {
    clearTransientStyles(s.element, s.peers)
  }

  setPatchSilent(false)

  const changes: Change[] = []

  // Style changes — left / top / position. We only commit a change when the
  // *post-drag* inline value differs from the pre-drag (resolved) value, since
  // the change pipeline coalesces by property and a no-op write would still
  // produce a redundant agent call.
  const snap = s.previousInline.get(s.element)
  if (snap) {
    for (const property of ['position', 'left', 'top'] as const) {
      const before = snap.get(property) || readComputed(s.element, property)
      const after =
        readInline(s.element, property) || readComputed(s.element, property)
      if (after !== before) {
        changes.push({ property, previousValue: before, newValue: after })
      }
    }
  }

  // For free-in-flow / toggle-to-in-flow / insertion-line: if the element
  // ended up at a new DOM index, emit a `moveNode` change. v1 spec: the
  // canvas-side gesture works (DOM is mutated) but the agent's source rewrite
  // is the next milestone — until then this is a no-op on the server,
  // surfaced via the change-log path. See tech-specs/drag-to-reposition.md §8.2.
  const finalDomIndex = Array.from(s.parent.children).indexOf(s.element)
  if (
    !s.isClone &&
    finalDomIndex !== s.startDomIndex &&
    finalDomIndex !== -1
  ) {
    // Phase 1 wire-shape: send as a style change with a synthetic property
    // name so the existing pipeline carries it. The agent currently rejects
    // unknown properties — that's the documented limitation. Replacing this
    // with the full `Change` union extension is the next milestone.
    changes.push({
      property: 'pixel-move-node',
      previousValue: String(s.startDomIndex),
      newValue: String(finalDomIndex),
    })
  }

  // For Alt clones, emit a `duplicateNode` placeholder change. Same v1
  // limitation as `moveNode` — wire-shape stub until the agent supports it.
  if (s.isClone && s.originalElement) {
    const cs = getComputedStyle(s.element)
    const placement =
      cs.position === 'absolute' || cs.position === 'fixed'
        ? `absolute:${parseInt(cs.left) || 0},${parseInt(cs.top) || 0}`
        : `in-flow:${Array.from(s.parent.children).indexOf(s.element)}`
    changes.push({
      property: 'pixel-duplicate-node',
      previousValue: '',
      newValue: placement,
    })
  }

  if (changes.length === 0) return

  commitChangeBatch({
    element: s.originalElement ?? s.element,
    htmlBefore: s.htmlBefore,
    changes,
  })
}

/** Clear inline `transform` / `z-index` / `opacity` from the dragged element
 *  + peers after the snap animation finishes. These are transient drag-only
 *  decorations — clearing them restores the source's declared values without
 *  going through the change reporter (silent mode was already turned off by
 *  finalizeCommit before this fires).
 *
 *  We do NOT clear `position` here, even when we wrote it transiently: a
 *  free-in-flow drag wrote `position: relative` for stacking, which is layout-
 *  neutral; a Ctrl-toggle wrote `position: absolute`, which the source rewrite
 *  is about to make permanent. Either way HMR (or the next render) replaces
 *  the inline value with the source's declared one. Clearing `position`
 *  before HMR catches up would cause a visible flash on the Ctrl path. */
function clearTransientStyles(element: HTMLElement, peers: readonly HTMLElement[]): void {
  const props = ['transform', 'z-index', 'opacity'] as const
  for (const el of [element, ...peers]) {
    for (const prop of props) {
      el.style.removeProperty(prop)
    }
  }
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
