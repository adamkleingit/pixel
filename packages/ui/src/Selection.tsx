import { useEffect, useRef, useState } from 'react'
import { useSelectionStore } from './selection/selection-store'
import {
  computeDrillTarget,
  computeHoverTarget,
  pointerElement,
  rectOf,
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

  useEffect(() => {
    // Anchor depth at <body> (not document) so depth-0 is the app's top content
    // element, and "outside → inside" drilling steps through real page levels —
    // anchoring at document would make the first hover/select the whole <html>.
    const root: HTMLElement = document.body
    const lastDown = { at: 0, target: null as Element | null }
    let metaHeld = false
    let lastPointerTarget: Element | null = null

    const anchor = (): Element | null => storeRef.current.entries[0]?.element ?? null

    function onPointerMove(event: Event) {
      const e = event as PointerEvent
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
      if (inOwnUI(e)) return
      const target = pointerElement(e, root)
      if (!target) return
      // Suppress native focus / drag-to-select; the edit-inert layer already
      // swallows click/mousedown, but pointerdown is left live for us.
      e.preventDefault()

      const now = performance.now()
      const isDouble = lastDown.target === target && now - lastDown.at < DOUBLE_MS
      lastDown.at = now
      lastDown.target = target

      const current = anchor()

      // Double → drill one level deeper into the pointer stack.
      if (isDouble) {
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
      // Leaving edit mode clears the selection.
      storeRef.current.clearAll()
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
    </>
  )
}

/** A fixed-position box tracking an element's viewport rect (via rectOf). */
function Outline({ el, variant }: { el: Element; variant: 'anchor' | 'match' | 'hover' }) {
  const [rect, setRect] = useState<Rect>(() => rectOf(el))
  useEffect(() => {
    const update = () => setRect(rectOf(el))
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
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
