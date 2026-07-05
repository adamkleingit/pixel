import { useEffect, useRef, useState } from 'react'
import { eventInOwnUI } from './own-ui'
import { useSelectionStore } from './selection/selection-store'
import { useEditHistory } from './edit/edit-history'
import { beginInlineEdit, isInlineEditable, isTextEditable, type InlineEditSession } from './edit/inline-text-edit'
import { ResizeHandles } from './drag/Handles'
import { SpacingHandles } from './drag/SpacingHandles'
import { CornerRadiusHandles } from './drag/CornerRadiusHandles'
import { InsertionLine } from './drag/InsertionLine'
import { SnapGuides } from './drag/SnapGuides'
import { startRepositionDrag } from './drag/reposition-drag'
import { BEGIN_INLINE_EDIT_EVENT, resetElementPointerDown } from './drag/handle-inline-edit'
import { computeKeyboardMove, isArrowKey } from './drag/keyboard-move'
import {
  computeDrillTarget,
  computeHoverTarget,
  pointerElement,
  rectOf,
  rectsEqual,
  type Rect,
} from './selection/selection-utils'

/**
 * Edit-mode selection — ported from Pixel's canvas selection model and kept
 * deliberately close to the original (`Selection.tsx` / `selection.utils.ts`).
 * The interaction model:
 *   - hover         → depth-anchored to the current selection (computeHoverTarget)
 *   - Cmd/Ctrl hover/click → the exact leaf under the pointer (skip anchoring)
 *   - click         → select the hovered target (replaces the set)
 *   - Shift+click   → toggle the target in/out of the multi-selection set
 *   - double-click  → drill one level deeper (outside → inside)
 *   - Escape        → clear selection (then, if empty, the provider exits edit)
 *
 * Boundaries vs. Pixel: the root is the live `document` (not a tile ShadowRoot),
 * listeners attach to `window` (not a per-tile shadow), and there's one surface
 * so a constant tileId is used. Reposition-drag and inline-edit (also in Pixel's
 * Selection) are deferred to later capability ports. Selection state lives in
 * the shared SelectionProvider so an Elements panel can read it.
 */

const TILE = 'app'
const DOUBLE_MS = 400

/** True if the event originated inside Pixel's own UI — the bar/overlay, or a
 *  menu/popover portaled to document.body (e.g. the Layout gap/size dropdowns).
 *  Shared with the provider's capture layers via `own-ui`. */
const inOwnUI = eventInOwnUI

export function Selection({ passthrough = false }: { passthrough?: boolean } = {}) {
  const store = useSelectionStore()
  const storeRef = useRef(store)
  storeRef.current = store
  // `commit` is stable; capture it in a ref so the once-installed listeners use it.
  const history = useEditHistory()
  const commitRef = useRef(history.commit)
  commitRef.current = history.commit
  // Mouse tool OFF (passthrough): stay dormant so pointer input reaches the real
  // app. Read through a ref so the once-installed capture listeners see the live
  // value. Overlays hide their interactive parts too (see SelectionOverlays).
  const passthroughRef = useRef(passthrough)
  passthroughRef.current = passthrough

  useEffect(() => {
    // Edit-mode cursor/selection normalization (see styles `html.pixel-editing`).
    document.documentElement.classList.add('pixel-editing')
    // The active inline-text edit session, if any (double-click on text).
    let editSession: InlineEditSession | null = null
    // Anchor depth at <body> (not document) so depth-0 is the app's top content
    // element, and "outside → inside" drilling steps through real page levels —
    // anchoring at document would make the first hover/select the whole <html>.
    const root: HTMLElement = document.body
    const lastDown = { at: 0, target: null as Element | null }
    let metaHeld = false
    let lastPointerTarget: Element | null = null

    const anchor = (): Element | null => storeRef.current.entries[0]?.element ?? null

    const DRAG_THRESHOLD = 4 // screen px

    // Arm a reposition drag on the just-selected element. Watches `pointermove`
    // and `pointerup` on document: if the cursor crosses DRAG_THRESHOLD before
    // release, hand off to `startRepositionDrag` (Pixel's layout-aware move —
    // static/flex/absolute, Cmd insertion-line, Ctrl flow-toggle, Alt
    // duplicate); if release fires first, just tear down — the click already
    // routed selection state correctly. Ported verbatim from Pixel's
    // Selection.tsx `armRepositionDrag`.
    function armRepositionDrag(
      element: HTMLElement,
      down: PointerEvent,
      peers: HTMLElement[],
    ) {
      const startX = down.clientX
      const startY = down.clientY
      const startedWithAlt = down.altKey
      const startedWithMeta = down.metaKey
      const startedWithCtrl = down.ctrlKey
      const startedWithShift = down.shiftKey

      function onMove(e: PointerEvent) {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
        teardown()
        startRepositionDrag({
          element,
          startX,
          startY,
          // Re-read modifiers from the *current* event when threshold is
          // crossed, so a user who holds Cmd just-before-drag still gets
          // insertion-line mode even if it wasn't held at pointerdown. Alt is
          // the exception per spec §3 — captured at the threshold moment, not
          // re-read every frame after.
          altKey: e.altKey || startedWithAlt,
          metaKey: e.metaKey || startedWithMeta,
          ctrlKey: e.ctrlKey || startedWithCtrl,
          shiftKey: e.shiftKey || startedWithShift,
          peers,
        })
      }
      function teardown() {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', teardown)
        document.removeEventListener('pointercancel', teardown)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', teardown)
      document.addEventListener('pointercancel', teardown)
    }

    function onPointerMove(event: Event) {
      const e = event as PointerEvent
      if (passthroughRef.current) return // mouse tool off — the app is live
      if (editSession) return // an inline edit owns the pointer
      if (inOwnUI(e)) return
      const target = pointerElement(e, root)
      lastPointerTarget = target
      metaHeld = e.metaKey || e.ctrlKey
      if (!target) {
        storeRef.current.setHover(TILE, null)
        return
      }
      // Cmd held → hover the leaf the cursor is actually over (skip the
      // depth-anchoring that normally caps hover at the selection's depth).
      const picked = metaHeld ? target : computeHoverTarget(target, root, anchor())
      storeRef.current.setHover(TILE, picked)
    }

    // Open an inline edit on `el`, mirroring onto `peers` (multi-edit). Shared by
    // the body double-click path and the handle-double bridge (BEGIN_INLINE_EDIT
    // dispatched from a resize/spacing/radius handle over a short element).
    function beginEditOn(el: HTMLElement, peers: HTMLElement[]): boolean {
      const session = beginInlineEdit(el, commitRef.current, peers)
      if (!session) return false
      editSession = session
      storeRef.current.setHover(TILE, null)
      resetElementPointerDown()
      return true
    }

    // A handle over a (short) element completed a double-click → edit it. The
    // handle can't reach the selection pointerdown path (it's own-UI and stops
    // propagation), so it asks us over `window`.
    function onBeginInlineEditRequest(event: Event) {
      const el = (event as CustomEvent).detail?.element
      if (!(el instanceof HTMLElement) || editSession) return
      const selectedEls = storeRef.current.entries
        .map((en) => en.element)
        .filter((x): x is HTMLElement => x instanceof HTMLElement)
      const isMulti = selectedEls.length > 1
      const peers = selectedEls.filter((p) => p !== el)
      if (!isMulti) storeRef.current.pick(TILE, el)
      beginEditOn(el, peers)
    }

    function onPointerDown(event: Event) {
      const e = event as PointerEvent
      if (passthroughRef.current) return // mouse tool off — let the app handle it
      if (e.button !== 0) return
      const target = pointerElement(e, root)

      // An inline edit is active: a click inside the field places the caret
      // (leave it alone); a click anywhere else commits and exits the edit,
      // then continues as a normal selection. We must exit explicitly because
      // the preventDefault below would otherwise block the field's blur.
      if (editSession) {
        if (target && editSession.element.contains(target)) return
        editSession.exit({ commit: true })
        editSession = null
      }

      if (inOwnUI(e)) return
      if (!target) return
      // Suppress native focus / drag-to-select; the edit-inert layer already
      // swallows click/mousedown, but pointerdown is left live for us.
      e.preventDefault()

      const now = performance.now()
      const isDouble = lastDown.target === target && now - lastDown.at < DOUBLE_MS
      lastDown.at = now
      lastDown.target = target

      const current = anchor()

      // Double-click → inline edit. A form field (input/textarea) is a leaf you
      // never drill into, so double-clicking one edits it directly (fixes
      // short-input edit). With a multi-selection, double-clicking any selected
      // (text-editable) member edits *all* of them together. Otherwise Pixel's
      // single rule: edit the already-selected text element, else drill deeper.
      if (isDouble) {
        const selectedEls = storeRef.current.entries
          .map((en) => en.element)
          .filter((el): el is HTMLElement => el instanceof HTMLElement)
        const isMulti = selectedEls.length > 1
        const isField =
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
          isTextEditable(target)
        // In a multi-selection, the member the double-click landed on.
        const hitSelected = isMulti
          ? selectedEls.find((el) => el === target || el.contains(target)) ?? null
          : null
        // `isInlineEditable` covers both a pure-text leaf (plaintext edit) and a
        // mixed-content element like a <p> with <span>/<strong> runs (edited as
        // raw innerHTML) — so double-clicking such a paragraph edits it in place
        // instead of drilling into a child.
        const editTarget = isField
          ? (target as HTMLElement)
          : hitSelected && isInlineEditable(hitSelected)
            ? hitSelected
            : current && isInlineEditable(current) && current.contains(target)
              ? (current as HTMLElement)
              : null
        if (editTarget) {
          // The other selected elements get the same edit (peers). Keep a
          // multi-selection intact so every member is edited + outlined; a single
          // selection collapses onto the edited element as before.
          const peers = selectedEls.filter((el) => el !== editTarget)
          if (!isMulti) storeRef.current.pick(TILE, editTarget)
          if (beginEditOn(editTarget, peers)) return
        }
        const drilled = computeDrillTarget(target, root, current)
        storeRef.current.pick(TILE, drilled)
        storeRef.current.setHover(TILE, drilled)
        return
      }

      const cmdHeld = e.metaKey || e.ctrlKey
      const picked = cmdHeld ? target : computeHoverTarget(target, root, current)

      // Shift+click toggles the element in/out of the additive selection set.
      if (e.shiftKey) {
        storeRef.current.toggle(TILE, picked)
        return
      }

      // A plain press on a member of an active multi-selection keeps the set
      // intact: moving is disabled for multi (for now), and preserving the set
      // lets a follow-up double-click edit every member. (Clicking *outside* the
      // selection falls through and collapses to the clicked element as usual.)
      const entries = storeRef.current.entries
      const pressedInsideMulti =
        entries.length > 1 &&
        entries.some((en) => en.element === picked || en.element.contains(target))
      if (pressedInsideMulti) return

      storeRef.current.pick(TILE, picked) // replaces the whole set with [picked]
      storeRef.current.setHover(TILE, picked)

      // Arm a reposition drag: if the user moves more than DRAG_THRESHOLD screen
      // px before releasing, start a layout-aware move of `picked` (Pixel's
      // `startRepositionDrag`). Otherwise this was a click and the selection
      // state above already routed correctly. (Multi-select never reaches here —
      // canvas resize/spacing/rotation/radius fan out to peers, but move doesn't.)
      if (picked instanceof HTMLElement) {
        armRepositionDrag(picked, e, [])
      }
    }

    // Cmd press/release re-targets the hover (exact leaf vs depth-anchored)
    // without needing the pointer to move.
    function onModifierKey(event: KeyboardEvent) {
      if (event.key !== 'Meta' && event.key !== 'Control') return
      const next = event.type === 'keydown'
      if (next === metaHeld) return
      metaHeld = next
      const target = lastPointerTarget
      if (!target) return
      const picked = next ? target : computeHoverTarget(target, root, anchor())
      storeRef.current.setHover(TILE, picked)
    }

    // Escape clears the selection. Listening on `window` (capture) means we run
    // before the provider's document-capture Escape handler: if we clear a
    // selection we stop propagation so it doesn't *also* exit edit mode — a
    // second Escape (nothing selected) falls through and exits.
    function onKeyDown(event: KeyboardEvent) {
      // While inline-editing, Escape cancels the edit (and nothing else — block
      // the provider's edit-exit and the selection-clear). Other keys pass
      // through to the field (typing / Enter-to-commit).
      if (editSession) {
        if (event.key === 'Escape') {
          editSession.exit({ commit: false })
          editSession = null
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }

      // Arrow keys move the selected anchor (Pixel's keyboard reposition):
      // absolutely-positioned → nudge top/left (Shift = 10px); in-flow → step
      // up/down in the parent's child order (Shift = jump to first/last). The
      // whole gesture is consumed so the page doesn't scroll under a selection.
      if (isArrowKey(event.key)) {
        if (inOwnUI(event)) return // typing in our own panel — leave it alone
        const anchorEl = storeRef.current.entries[0]?.element
        if (anchorEl instanceof HTMLElement) {
          event.preventDefault()
          event.stopPropagation()
          const result = computeKeyboardMove(anchorEl, event.key, event.shiftKey)
          if (result) commitRef.current(result.changes, result.label)
        }
        return
      }

      if (event.key !== 'Escape') return
      const s = storeRef.current
      if (s.entries.length || s.hover) {
        s.clearAll()
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('pointermove', onPointerMove, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onModifierKey, true)
    window.addEventListener('keyup', onModifierKey, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener(BEGIN_INLINE_EDIT_EVENT, onBeginInlineEditRequest)
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onModifierKey, true)
      window.removeEventListener('keyup', onModifierKey, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener(BEGIN_INLINE_EDIT_EVENT, onBeginInlineEditRequest)
      // Leaving edit mode commits any open inline edit and clears the selection.
      editSession?.exit({ commit: true })
      editSession = null
      storeRef.current.clearAll()
      document.documentElement.classList.remove('pixel-editing')
    }
  }, [])

  return <SelectionOverlays interactive={!passthrough} />
}

/** Outlines for the anchor (solid), additional selected matches, and hover.
 *  When `interactive` is false (mouse tool OFF / passthrough), the anchor + match
 *  outlines still show what's selected, but the interactive overlays (hover,
 *  drag handles, insertion line, snap guides) are dropped so nothing intercepts
 *  the pointer while the real app is live underneath. */
function SelectionOverlays({ interactive = true }: { interactive?: boolean }) {
  const { entries, hover } = useSelectionStore()
  const anchor = entries[0]?.element ?? null
  const matches = entries.slice(1)
  // The matched (non-anchor) selected elements — the anchor's handle drags fan
  // out to these so resize / spacing / rotation / radius edit all at once.
  const peers = matches
    .map((e) => e.element)
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
  return (
    <>
      {interactive && hover && hover.element !== anchor && <Outline el={hover.element} variant="hover" />}
      {matches.map((e, i) => (
        <Outline key={i} el={e.element} variant="match" />
      ))}
      {anchor && <Outline el={anchor} variant="anchor" />}
      {/* Pixel's real drag overlays for the anchor: 8-way resize + rotate
          (ResizeHandles), padding/margin/gap spacing bars (SpacingHandles),
          and corner-radius dots (CornerRadiusHandles). They read commit
          through the change-reporter/patch seam directly, so they only need
          the live element + its viewport rect. `getMultiEditPeers` fans each
          drag out across the rest of the selection. Move is handled separately
          by armRepositionDrag (dragging the element body). */}
      {interactive && anchor instanceof HTMLElement && <AnchorHandles element={anchor} peers={peers} />}
      {/* Insertion line for Cmd-mode reposition drags. */}
      {interactive && <InsertionLine />}
      {/* Figma-style alignment guides for absolute move + resize drags. */}
      {interactive && <SnapGuides />}
    </>
  )
}

/** Renders Pixel's three handle overlays for the anchor, feeding each the
 *  element's live viewport rect (tracked on rAF + `pixel-drag-frame` so the
 *  handles follow the element as a gesture grows/shrinks it) and the selected
 *  peers (multi-edit fan-out; read at drag start). */
function AnchorHandles({ element, peers }: { element: HTMLElement; peers: HTMLElement[] }) {
  const rect = useTrackedRect(element)
  const getMultiEditPeers = () => peers
  return (
    <>
      <ResizeHandles rect={rect} element={element} getMultiEditPeers={getMultiEditPeers} />
      <SpacingHandles rect={rect} element={element} getMultiEditPeers={getMultiEditPeers} />
      <CornerRadiusHandles rect={rect} element={element} getMultiEditPeers={getMultiEditPeers} />
    </>
  )
}

/** Track an element's viewport rect continuously (only re-rendering when the
 *  box actually changes — rectsEqual), mirroring `Outline`. Also re-measures
 *  on every drag frame (`pixel-drag-frame`) so the handles track live edits. */
function useTrackedRect(element: HTMLElement): Rect {
  const [rect, setRect] = useState<Rect>(() => rectOf(element))
  useEffect(() => {
    let raf = 0
    let prev = rectOf(element)
    setRect(prev)
    const tick = () => {
      const next = rectOf(element)
      if (!rectsEqual(prev, next)) {
        prev = next
        setRect(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [element])
  return rect
}

/** A fixed-position box tracking an element's viewport rect (via rectOf). */
function Outline({ el, variant }: { el: Element; variant: 'anchor' | 'match' | 'hover' }) {
  const [rect, setRect] = useState<Rect>(() => rectOf(el))
  useEffect(() => {
    // Track continuously with rAF (only re-rendering when the box actually
    // changes — rectsEqual). This catches *every* reflow cause uniformly:
    // scroll, resize, and crucially the design pane collapsing/expanding (which
    // shifts the body width with a CSS transition and fires no scroll/resize).
    let raf = 0
    let prev = rectOf(el)
    setRect(prev)
    const tick = () => {
      const next = rectOf(el)
      if (!rectsEqual(prev, next)) {
        prev = next
        setRect(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [el])
  return (
    <div
      className={`pixel-sel pixel-sel-${variant}`}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: rect.radius,
        transform: rect.rotation ? `rotate(${rect.rotation}deg)` : undefined,
      }}
    />
  )
}
