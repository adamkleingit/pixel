/**
 * Shared hover-reveal + closest-handle tracking for the selection chrome.
 */
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { getViewportScale } from '../canvas/viewport'
import type { Rect } from '../selection/selection-utils'
import { isDragging as isResizeOrRotateDragging } from './drag-session'
import { computeResizeHandles, type DisplayInputs } from './handle-layout'
import {
  buildHandleCandidates,
  pickClosestHandle,
  readCornerRadii,
  readGapCandidates,
  readSideSpacing,
  type HandleId,
  syncHandlePointerEvents,
} from './handle-proximity'
import { isRadiusDragging } from './radius-drag'
import { resolveAnchor } from './resolve-anchor'
import { isSpacingDragging } from './spacing-drag'

const HOVER_DELAY_MS = 300
const HOVER_PAD = 8

export function useChromeReveal(element: HTMLElement, rect: Rect): boolean {
  const [hovering, setHovering] = useState(false)
  const [delayed, setDelayed] = useState(false)

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (isResizeOrRotateDragging() || isSpacingDragging() || isRadiusDragging()) {
        setHovering(false)
        return
      }
      const pad = HOVER_PAD
      const cs = getComputedStyle(element)
      const mt = parseFloat(cs.marginTop) || 0
      const mr = parseFloat(cs.marginRight) || 0
      const mb = parseFloat(cs.marginBottom) || 0
      const ml = parseFloat(cs.marginLeft) || 0
      const scale = getViewportScale() || 1
      const inside =
        e.clientX >= rect.left - ml * scale - pad &&
        e.clientX <= rect.left + rect.width + mr * scale + pad &&
        e.clientY >= rect.top - mt * scale - pad &&
        e.clientY <= rect.top + rect.height + mb * scale + pad
      setHovering(prev => (prev === inside ? prev : inside))
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [element, rect.left, rect.top, rect.width, rect.height])

  useEffect(() => {
    if (!hovering) { setDelayed(false); return }
    const t = window.setTimeout(() => setDelayed(true), HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [hovering])

  if (isSpacingDragging() || isRadiusDragging()) return true
  return delayed
}

export function useClosestHandle(
  element: HTMLElement,
  rect: Rect,
  chromeRevealed: boolean,
): HandleId | null | undefined {
  // `undefined` = not yet scored this selection → leave all handles interactive
  // (avoids a frame where chrome reveals with every hit target disabled).
  // `null` = scored and nothing is close. `string` = winner.
  const [activeId, setActiveId] = useState<HandleId | null | undefined>(undefined)
  const activeIdRef = useRef<HandleId | null | undefined>(undefined)
  activeIdRef.current = activeId

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (isResizeOrRotateDragging() || isSpacingDragging() || isRadiusDragging()) return
      const cs = getComputedStyle(element)
      if (cs.display === 'none' || cs.display === 'contents') {
        if (activeIdRef.current !== null) {
          activeIdRef.current = null
          flushSync(() => setActiveId(null))
        }
        return
      }
      const inputs: DisplayInputs = { display: cs.display, position: cs.position }
      const layout = computeResizeHandles(inputs, resolveAnchor(element), {
        hasExplicitWidth: true,
        hasExplicitHeight: true,
      })
      const scale = getViewportScale() || 1
      const candidates = buildHandleCandidates({
        rect,
        layout,
        chromeRevealed,
        radii: chromeRevealed ? readCornerRadii(element) : undefined,
        padding: chromeRevealed ? readSideSpacing(cs, 'padding') : undefined,
        margin: chromeRevealed ? readSideSpacing(cs, 'margin') : undefined,
        gaps: chromeRevealed ? readGapCandidates(element, rect, cs) : undefined,
        scale,
      })
      const next = pickClosestHandle(
        candidates,
        { x: e.clientX, y: e.clientY },
        rect,
        { currentId: activeIdRef.current },
      )
      if (next !== activeIdRef.current) {
        activeIdRef.current = next
        // Flush so pointerdown in the same gesture sees the gated hit target.
        flushSync(() => setActiveId(next))
      }
      syncHandlePointerEvents(activeIdRef.current)
    }
    // Capture-phase pointerdown: re-sync so down never hits a stale loser.
    function onDown() {
      syncHandlePointerEvents(activeIdRef.current)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [element, rect, chromeRevealed])

  // Newly revealed spacing/radius must not inherit a prior "null/far" gate that
  // left every hit target non-interactive until the pointer moves again.
  useEffect(() => {
    activeIdRef.current = undefined
    setActiveId(undefined)
    syncHandlePointerEvents(undefined)
  }, [chromeRevealed, element])

  return activeId
}

export function handlePointerEvents(
  activeHandleId: HandleId | null | undefined,
  myId: HandleId,
): 'auto' | 'none' {
  // undefined → ungated (before first proximity score). null → nothing close.
  if (activeHandleId === undefined) return 'auto'
  return activeHandleId === myId ? 'auto' : 'none'
}
