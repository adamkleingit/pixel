import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { getViewportScale } from '../canvas/viewport'
import { COLORS, FONT_SIZE, FONTS, RADIUS } from '../design-system'
import { useTokenMatch } from '../properties-sidebar/useTokenMatch'
import type { Rect } from '../selection/selection-utils'
import { isDragging as isResizeOrRotateDragging } from './drag-session'
import { maybeBeginInlineEditFromHandle } from './handle-inline-edit'
import {
  getActiveRadiusDrag,
  RADIUS_CORNER_PROPERTIES,
  startRadiusDrag,
  type RadiusCorner,
} from './radius-drag'
import { isSpacingDragging } from './spacing-drag'
import { setSnapTargets } from './token-snap'

/**
 * Figma-style corner-radius dots — four white-filled circles inside the
 * selected element, one per corner, positioned `r` px inward along the
 * corner's diagonal where `r` is that corner's current radius.
 *
 * Drag a dot inward/outward to change that corner's radius (uses
 * `radius-drag`, which projects pointer motion onto the inward diagonal and
 * clamps to `[0, min(W, H) / 2]`).
 *  - Plain drag: only this corner.
 *  - **Alt / Option held**: all four corners change together.
 *
 * Hover or drag shows a "Radius {n}" pill above the active dot, with the
 * matching design-token name appended when the current value coincides with a
 * border-radius token.
 *
 * Suppressed while a resize/rotate or spacing drag is active so the dots
 * don't fight those gestures. Also suppressed when the element is rotated —
 * matches `SpacingHandles`, where rotated boxes break the axis-aligned
 * handle math.
 */

const DOT_SIZE = 8
const HIT_PAD = 5
const LABEL_GAP = 8
const HOVER_REVEAL_DELAY_MS = 300
// Always nudge the radius dot this many screen px further inward along the
// diagonal so it never lands on the corner resize handle (which sits exactly
// on the corner). Keeps both the radius dot and the resize handle grabbable
// even when the radius is 0.
const CORNER_INSET = 8

const ALL_CORNERS: readonly RadiusCorner[] = ['tl', 'tr', 'br', 'bl']

const CURSOR_BY_CORNER: Record<RadiusCorner, string> = {
  tl: 'nwse-resize',
  br: 'nwse-resize',
  tr: 'nesw-resize',
  bl: 'nesw-resize',
}

function useDragFrame(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    function bump() { setTick(t => t + 1) }
    document.addEventListener('pixel-drag-frame', bump)
    return () => document.removeEventListener('pixel-drag-frame', bump)
  }, [])
}

function readPx(el: Element, property: string): number {
  return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0
}

export function CornerRadiusHandles({
  rect,
  element,
  getMultiEditPeers,
}: {
  rect: Rect
  element: Element
  getMultiEditPeers?: () => HTMLElement[]
}) {
  useDragFrame()
  const radiusMatch = useTokenMatch('border-radius')
  // Publish radius tokens to the drag registry so on-canvas radius drags can
  // snap to them (the drag sessions are non-React and can't read the context).
  useEffect(() => {
    setSnapTargets(
      'radius',
      radiusMatch.snapTargets.map(t => ({ value: t.numericValue, token: t.token })),
    )
  }, [radiusMatch.snapTargets])
  // Mirror `SpacingHandles`' reveal-on-hover gating so the dots don't add
  // visual noise to every selected element — they appear once the pointer
  // settles over the selection for a beat.
  const [hoveringElement, setHoveringElement] = useState(false)
  const [delayed, setDelayed] = useState(false)

  useEffect(() => {
    if (!(element instanceof HTMLElement)) return
    function onMove(e: PointerEvent) {
      if (isResizeOrRotateDragging() || isSpacingDragging()) {
        setHoveringElement(false)
        return
      }
      const r = (element as HTMLElement).getBoundingClientRect()
      const inside =
        e.clientX >= r.left   - HIT_PAD &&
        e.clientX <= r.right  + HIT_PAD &&
        e.clientY >= r.top    - HIT_PAD &&
        e.clientY <= r.bottom + HIT_PAD
      setHoveringElement(prev => (prev === inside ? prev : inside))
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [element])

  useEffect(() => {
    if (!hoveringElement) { setDelayed(false); return }
    const t = window.setTimeout(() => setDelayed(true), HOVER_REVEAL_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [hoveringElement])

  if (!(element instanceof HTMLElement)) return null
  // Skip rotated boxes — the dot/inward math assumes an axis-aligned rect.
  if (Math.round(rect.rotation) !== 0) return null
  if (isResizeOrRotateDragging() || isSpacingDragging()) return null

  const drag = getActiveRadiusDrag()
  const dragActive = !!drag && drag.element === element
  if (!delayed && !dragActive) return null

  const scale = getViewportScale() || 1
  const W = rect.width
  const H = rect.height
  // Per-corner radii in CSS px; scaled by viewport for positioning since the
  // overlay lives in screen space. While a drag is active, every corner in
  // the mirror set reads `drag.value` so all four dots travel together when
  // alt is held.
  const radii: Record<RadiusCorner, number> = {
    tl: readPx(element, 'border-top-left-radius'),
    tr: readPx(element, 'border-top-right-radius'),
    br: readPx(element, 'border-bottom-right-radius'),
    bl: readPx(element, 'border-bottom-left-radius'),
  }
  if (drag && drag.element === element) {
    for (const corner of drag.corners) radii[corner] = drag.value
  }

  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: W,
    height: H,
    pointerEvents: 'none',
    // Above ResizeHandles (1002) but below SpacingHandles (1003) — we already
    // suppress while spacing is active, so the order only matters for hover
    // priority within our own surface.
    zIndex: 1002,
  }

  return (
    <div style={containerStyle}>
      {ALL_CORNERS.map(corner => (
        <Dot
          key={corner}
          corner={corner}
          element={element}
          rotationDeg={rect.rotation}
          radius={radii[corner]}
          W={W}
          H={H}
          scale={scale}
          drag={drag}
          getMultiEditPeers={getMultiEditPeers}
          matchToken={radiusMatch.matchToken}
        />
      ))}
    </div>
  )
}

function Dot({
  corner,
  element,
  rotationDeg,
  radius,
  W,
  H,
  scale,
  drag,
  getMultiEditPeers,
  matchToken,
}: {
  corner: RadiusCorner
  element: HTMLElement
  rotationDeg: number
  radius: number
  W: number
  H: number
  scale: number
  drag: ReturnType<typeof getActiveRadiusDrag>
  getMultiEditPeers?: () => HTMLElement[]
  matchToken: (value: string) => { name: string } | null
}) {
  const [hovered, setHovered] = useState(false)

  // Dot position — `r` CSS px inward from the corner along the diagonal,
  // converted to screen px for the overlay. Capped at the geometric limit so
  // the dot can never travel past the element's centre.
  const maxR = Math.min(W, H) / 2 / scale
  const r = Math.min(radius, maxR)
  const inset = r * scale + CORNER_INSET
  const top = (corner === 'tl' || corner === 'tr') ? inset : H - inset
  const left = (corner === 'tl' || corner === 'bl') ? inset : W - inset

  const draggingThis =
    !!drag && drag.element === element && drag.corners.has(corner)
  const dragSomethingElse = !!drag && !draggingThis

  const showLabel = (hovered && !dragSomethingElse) || draggingThis

  const tokenName = matchToken(`${Math.round(radius)}px`)?.name ?? null

  return (
    <>
      {/* Visible dot — click-through; the hit area below owns input so the
          dot stays grabbable even when r === 0 (sits on the corner). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top,
          left,
          width: DOT_SIZE,
          height: DOT_SIZE,
          marginTop: -DOT_SIZE / 2,
          marginLeft: -DOT_SIZE / 2,
          borderRadius: '50%',
          background: '#ffffff',
          border: `1px solid ${COLORS.accent}`,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
          opacity: draggingThis ? 1 : 0.95,
        }}
      />
      <div
        data-resize-handle="radius"
        data-corner={corner}
        title={`Corner radius: ${Math.round(radius)}px — drag to adjust (alt = all corners)`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={e =>
          beginRadiusDrag(e, { element, corner, rotationDeg, getMultiEditPeers })
        }
        style={{
          position: 'absolute',
          top,
          left,
          width: DOT_SIZE + HIT_PAD * 2,
          height: DOT_SIZE + HIT_PAD * 2,
          marginTop: -(DOT_SIZE / 2 + HIT_PAD),
          marginLeft: -(DOT_SIZE / 2 + HIT_PAD),
          background: 'transparent',
          cursor: CURSOR_BY_CORNER[corner],
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      />
      {showLabel && (
        <RadiusLabel
          top={top}
          left={left}
          corner={corner}
          value={Math.round(radius)}
          tokenName={tokenName}
        />
      )}
    </>
  )
}

function RadiusLabel({
  top,
  left,
  corner,
  value,
  tokenName,
}: {
  top: number
  left: number
  corner: RadiusCorner
  value: number
  tokenName: string | null
}) {
  // Anchor the pill outside the corner along the dot's diagonal so it never
  // covers the dot itself or the element interior.
  const above = corner === 'tl' || corner === 'tr'
  const leftSide = corner === 'tl' || corner === 'bl'
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: above ? top - LABEL_GAP : top + LABEL_GAP,
        left,
        transform: `translate(${leftSide ? '-100%' : '0'}, ${above ? '-100%' : '0'})`,
        background: COLORS.accent,
        color: '#ffffff',
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.xs,
        fontWeight: 600,
        letterSpacing: 0.3,
        lineHeight: 1.4,
        padding: '2px 6px',
        borderRadius: RADIUS.sm,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {tokenName ? `Radius ${value} · ${tokenName}` : `Radius ${value}`}
    </div>
  )
}

interface BeginRadiusInput {
  element: HTMLElement
  corner: RadiusCorner
  rotationDeg: number
  getMultiEditPeers?: () => HTMLElement[]
}

function beginRadiusDrag(
  e: ReactPointerEvent<HTMLDivElement>,
  input: BeginRadiusInput,
): void {
  if (e.button !== 0) return
  // Double-click over a text element's radius dot opens inline editing —
  // matches the resize/spacing handle behaviour.
  if (maybeBeginInlineEditFromHandle(input.element)) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  e.preventDefault()
  e.stopPropagation()
  startRadiusDrag({
    element: input.element,
    corner: input.corner,
    startX: e.clientX,
    startY: e.clientY,
    rotationDeg: input.rotationDeg,
    cursor: CURSOR_BY_CORNER[input.corner],
    peers: input.getMultiEditPeers?.() ?? [],
  })
}

// Re-export so callers don't need to reach into radius-drag for the
// longhand list (e.g. peer-snapshot capture in multi-edit).
export { RADIUS_CORNER_PROPERTIES }
