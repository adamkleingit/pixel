import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditHistory } from '../edit/edit-history'
import { rectOf, type Rect } from '../selection/selection-utils'
import { getViewportScale } from '../selection/viewport'
import {
  isDragging,
  startRadiusDrag,
  startResizeDrag,
  type Committer,
  type HandleCorner,
  type HandleSide,
  type RadiusCorner,
} from './drag-session'

/**
 * On-element drag handles for a single live DOM element. Draws a fixed overlay
 * tracking the element's viewport rect and edits it via gestures:
 *  - RESIZE — 8 handles (4 corners + 4 edges). Corner/edge drags write
 *    `width`/`height`, and for top/left handles also `left`/`top` (promoting a
 *    `static` element to `position: relative` so they take effect).
 *  - MOVE — a transparent layer over the body; dragging writes `left`/`top`
 *    (same position caveat).
 *  - CORNER-RADIUS — a small knob inset from the bottom-right corner; dragging
 *    along the inward diagonal writes `border-radius` (clamped >= 0).
 *
 * Each gesture commits ONE atomic entry through the edit-history on pointer-up,
 * so undo reverts the whole drag. A DRAG_THRESHOLD guards clicks. Ported close
 * to Pixel's `Handles`/`CornerRadiusHandles` layout and `drag-session`/
 * `radius-drag` math; see `drag-session.ts` for the gesture engine.
 *
 * The CSS lives in `handles-css.ts` (`HANDLES_CSS`); the host injects it.
 */

const EDGE_GRAB_THICKNESS = 10
/** Inset for the radius knob so it never lands on the corner resize handle. */
const RADIUS_KNOB_INSET = 14

const ALL_CORNERS: readonly HandleCorner[] = ['tl', 'tr', 'br', 'bl']
const ALL_SIDES: readonly HandleSide[] = ['top', 'right', 'bottom', 'left']

const CURSOR_CLASS_BY_CORNER: Record<HandleCorner, string> = {
  tl: 'screenshare-h-cursor-nwse',
  br: 'screenshare-h-cursor-nwse',
  tr: 'screenshare-h-cursor-nesw',
  bl: 'screenshare-h-cursor-nesw',
}

const CURSOR_KEYWORD_BY_CORNER: Record<HandleCorner, string> = {
  tl: 'nwse-resize',
  br: 'nwse-resize',
  tr: 'nesw-resize',
  bl: 'nesw-resize',
}

const CURSOR_CLASS_BY_SIDE: Record<HandleSide, string> = {
  top: 'screenshare-h-cursor-ns',
  bottom: 'screenshare-h-cursor-ns',
  left: 'screenshare-h-cursor-ew',
  right: 'screenshare-h-cursor-ew',
}

const CURSOR_KEYWORD_BY_SIDE: Record<HandleSide, string> = {
  top: 'ns-resize',
  bottom: 'ns-resize',
  left: 'ew-resize',
  right: 'ew-resize',
}

/** Re-render the overlay on each drag frame so handles track the live rect. */
function useDragFrame(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    function bump() {
      setTick((t) => t + 1)
    }
    document.addEventListener('screenshare-drag-frame', bump)
    return () => document.removeEventListener('screenshare-drag-frame', bump)
  }, [])
}

/** Track the element's viewport rect with rAF (only re-rendering when it
 *  actually changes), mirroring `Selection.tsx`'s `Outline`. Catches every
 *  reflow cause uniformly — scroll, resize, and live drag edits. */
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

function rectsEqual(a: Rect, b: Rect): boolean {
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.radius === b.radius &&
    a.rotation === b.rotation
  )
}

export function Handles({ element }: { element: HTMLElement }) {
  useDragFrame()
  const rect = useTrackedRect(element)
  const history = useEditHistory()
  // Keep a stable committer identity but always read the latest history funcs.
  const committerRef = useRef<Committer>({ applyLive: history.applyLive, commit: history.commit })
  committerRef.current = { applyLive: history.applyLive, commit: history.commit }

  return (
    <div
      className="screenshare-h-root"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        transform: rect.rotation ? `rotate(${rect.rotation}deg)` : undefined,
        transformOrigin: '50% 50%',
      }}
    >
      {/* Move grip removed — moving will be re-done as dragging the element
          itself (Pixel's reposition-drag) in the faithful drag port. */}
      {ALL_SIDES.map((side) => (
        <EdgeBand key={side} side={side} element={element} rect={rect} committerRef={committerRef} />
      ))}
      {ALL_CORNERS.map((corner) => (
        <CornerHandle key={corner} corner={corner} element={element} rect={rect} committerRef={committerRef} />
      ))}
      <RadiusKnob element={element} rect={rect} committerRef={committerRef} />
    </div>
  )
}

type CommitterRef = { current: Committer }

function CornerHandle({
  corner,
  element,
  rect,
  committerRef,
}: {
  corner: HandleCorner
  element: HTMLElement
  rect: Rect
  committerRef: CommitterRef
}) {
  const top = corner === 'tl' || corner === 'tr'
  const left = corner === 'tl' || corner === 'bl'
  return (
    <div
      className={`screenshare-h-dot ${CURSOR_CLASS_BY_CORNER[corner]}`}
      data-handle="resize"
      data-corner={corner}
      style={{ top: top ? 0 : '100%', left: left ? 0 : '100%' }}
      onPointerDown={(e) => {
        if (e.button !== 0 || isDragging()) return
        e.preventDefault()
        e.stopPropagation()
        capture(e)
        startResizeDrag({
          element,
          committer: committerRef.current,
          corner,
          startX: e.clientX,
          startY: e.clientY,
          rotationDeg: rect.rotation,
          cursor: CURSOR_KEYWORD_BY_CORNER[corner],
        })
      }}
    />
  )
}

function EdgeBand({
  side,
  element,
  rect,
  committerRef,
}: {
  side: HandleSide
  element: HTMLElement
  rect: Rect
  committerRef: CommitterRef
}) {
  const thickness = EDGE_GRAB_THICKNESS
  const style =
    side === 'top'
      ? { left: 0, top: 0, width: '100%', height: thickness }
      : side === 'bottom'
        ? { left: 0, top: `calc(100% - ${thickness}px)`, width: '100%', height: thickness }
        : side === 'left'
          ? { left: 0, top: 0, width: thickness, height: '100%' }
          : { left: `calc(100% - ${thickness}px)`, top: 0, width: thickness, height: '100%' }
  return (
    <div
      className={`screenshare-h-edge ${CURSOR_CLASS_BY_SIDE[side]}`}
      data-handle="resize"
      data-side={side}
      style={style}
      onPointerDown={(e) => {
        if (e.button !== 0 || isDragging()) return
        e.preventDefault()
        e.stopPropagation()
        capture(e)
        startResizeDrag({
          element,
          committer: committerRef.current,
          side,
          startX: e.clientX,
          startY: e.clientY,
          rotationDeg: rect.rotation,
          cursor: CURSOR_KEYWORD_BY_SIDE[side],
        })
      }}
    />
  )
}

/** Single corner-radius knob, inset from the bottom-right corner along its
 *  inward diagonal. Skipped on rotated boxes (the inset math assumes an
 *  axis-aligned rect, matching Pixel's `CornerRadiusHandles`). */
function RadiusKnob({
  element,
  rect,
  committerRef,
}: {
  element: HTMLElement
  rect: Rect
  committerRef: CommitterRef
}) {
  if (Math.round(rect.rotation) !== 0) return null
  const corner: RadiusCorner = 'br'
  const scale = getViewportScale() || 1
  const maxR = Math.min(rect.width, rect.height) / 2 / scale
  const radius = Math.min(readPx(element, 'border-bottom-right-radius'), maxR)
  const inset = radius * scale + RADIUS_KNOB_INSET
  return (
    <div
      className={`screenshare-h-radius ${CURSOR_CLASS_BY_CORNER[corner]}`}
      data-handle="radius"
      data-corner={corner}
      title="Corner radius — drag to adjust"
      style={{ top: rect.height - inset, left: rect.width - inset }}
      onPointerDown={(e) => {
        if (e.button !== 0 || isDragging()) return
        e.preventDefault()
        e.stopPropagation()
        capture(e)
        startRadiusDrag({
          element,
          committer: committerRef.current,
          corner,
          startX: e.clientX,
          startY: e.clientY,
          rotationDeg: rect.rotation,
          cursor: CURSOR_KEYWORD_BY_CORNER[corner],
        })
      }}
    />
  )
}

function readPx(el: HTMLElement, property: string): number {
  return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0
}

/** setPointerCapture throws in jsdom — keep the gesture alive regardless. */
function capture(e: ReactPointerEvent<HTMLDivElement>): void {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    /* jsdom / unsupported — pointer events still bubble to document. */
  }
}
