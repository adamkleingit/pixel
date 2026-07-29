/**
 * Shared hover-reveal + closest-handle tracking for the selection chrome.
 */
import { useEffect, useRef, useState } from 'react'
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
): HandleId | null {
  const [activeId, setActiveId] = useState<HandleId | null>(null)
  const activeIdRef = useRef<HandleId | null>(null)
  activeIdRef.current = activeId

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (isResizeOrRotateDragging() || isSpacingDragging() || isRadiusDragging()) return
      const cs = getComputedStyle(element)
      if (cs.display === 'none' || cs.display === 'contents') {
        if (activeIdRef.current !== null) {
          activeIdRef.current = null
          setActiveId(null)
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
        setActiveId(next)
      }
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [element, rect, chromeRevealed])

  return activeId
}

export function handlePointerEvents(
  activeHandleId: HandleId | null | undefined,
  myId: HandleId,
): 'auto' | 'none' {
  if (activeHandleId === undefined) return 'auto'
  return activeHandleId === myId ? 'auto' : 'none'
}
