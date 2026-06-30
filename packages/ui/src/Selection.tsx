import { useEffect, useRef, useState } from 'react'
import { useSelectionStore } from './selection/selection-store'
import { useEditHistory } from './edit/edit-history'
import { beginInlineEdit, isTextEditable, type InlineEditSession } from './edit/inline-text-edit'
import { ResizeHandles } from './drag/Handles'
import { SpacingHandles } from './drag/SpacingHandles'
import { CornerRadiusHandles } from './drag/CornerRadiusHandles'
import { InsertionLine } from './drag/InsertionLine'
import { startRepositionDrag } from './drag/reposition-drag'
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

/** True if the event originated inside Pixel's own UI (the bar / overlay). */
function inOwnUI(e: Event): boolean {
  return e
    .composedPath()
    .some((n) => n instanceof Element && n.classList?.contains('screenshare-overlay'))
}

export function Selection() {
  const store = useSelectionStore()
  const storeRef = useRef(store)
  storeRef.current = store
  // `commit` is stable; capture it in a ref so the once-installed listeners use it.
  const history = useEditHistory()
  const commitRef = useRef(history.commit)
  commitRef.current = history.commit

  useEffect(() => {
    // Edit-mode cursor/selection normalization (see styles `html.screenshare-editing`).
    document.documentElement.classList.add('screenshare-editing')
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

    function onPointerDown(event: Event) {
      const e = event as PointerEvent
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
      // short-input edit). For everything else we keep Pixel's rule: edit only
      // the already-selected text element; otherwise drill one level deeper.
      if (isDouble) {
        const isField =
          (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
          isTextEditable(target)
        const editTarget = isField
          ? (target as HTMLElement)
          : current && isTextEditable(current) && current.contains(target)
            ? (current as HTMLElement)
            : null
        if (editTarget) {
          storeRef.current.pick(TILE, editTarget)
          const session = beginInlineEdit(editTarget, commitRef.current)
          if (session) {
            editSession = session
            storeRef.current.setHover(TILE, null)
            return
          }
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

      storeRef.current.pick(TILE, picked) // replaces the whole set with [picked]
      storeRef.current.setHover(TILE, picked)

      // Arm a reposition drag: if the user moves more than DRAG_THRESHOLD
      // screen px before releasing, start a layout-aware move of `picked`
      // (Pixel's `startRepositionDrag`). Otherwise this was a click and the
      // selection state above already routed correctly. No multi-edit peers
      // in-app yet → peers = []. See Pixel Selection.tsx § armRepositionDrag.
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
    return () => {
      window.removeEventListener('pointermove', onPointerMove, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onModifierKey, true)
      window.removeEventListener('keyup', onModifierKey, true)
      window.removeEventListener('keydown', onKeyDown, true)
      // Leaving edit mode commits any open inline edit and clears the selection.
      editSession?.exit({ commit: true })
      editSession = null
      storeRef.current.clearAll()
      document.documentElement.classList.remove('screenshare-editing')
    }
  }, [])

  return <SelectionOverlays />
}

/** Outlines for the anchor (solid), additional selected matches, and hover. */
function SelectionOverlays() {
  const { entries, hover } = useSelectionStore()
  const anchor = entries[0]?.element ?? null
  const matches = entries.slice(1)
  return (
    <>
      {hover && hover.element !== anchor && <Outline el={hover.element} variant="hover" />}
      {matches.map((e, i) => (
        <Outline key={i} el={e.element} variant="match" />
      ))}
      {anchor && <Outline el={anchor} variant="anchor" />}
      {/* Pixel's real drag overlays for the anchor: 8-way resize + rotate
          (ResizeHandles), padding/margin/gap spacing bars (SpacingHandles),
          and corner-radius dots (CornerRadiusHandles). They read commit
          through the change-reporter/patch seam directly, so they only need
          the live element + its viewport rect. Move is handled separately by
          armRepositionDrag (dragging the element body). */}
      {anchor instanceof HTMLElement && <AnchorHandles element={anchor} />}
      {/* Insertion line for Cmd-mode reposition drags. */}
      <InsertionLine />
    </>
  )
}

/** Renders Pixel's three handle overlays for the anchor, feeding each the
 *  element's live viewport rect (tracked on rAF + `pixel-drag-frame` so the
 *  handles follow the element as a gesture grows/shrinks it). */
function AnchorHandles({ element }: { element: HTMLElement }) {
  const rect = useTrackedRect(element)
  return (
    <>
      <ResizeHandles rect={rect} element={element} />
      <SpacingHandles rect={rect} element={element} />
      <CornerRadiusHandles rect={rect} element={element} />
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
      className={`screenshare-sel screenshare-sel-${variant}`}
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
