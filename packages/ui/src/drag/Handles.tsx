import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { COLORS, FONT_SIZE, FONTS, RADIUS } from '../design-system'
import type { Rect } from '../selection/selection-utils'
import { getActiveRotateDrag, startResizeDrag, startRotateDrag } from './drag-session'
import { maybeBeginInlineEditFromHandle } from './handle-inline-edit'
import {
  computeResizeHandles,
  type DisplayInputs,
  type HandleCorner,
  type HandleSide,
} from './handle-layout'
import { resolveAnchor } from './resolve-anchor'

/**
 * Resize / rotate handle overlay rendered on top of the selection rect.
 *
 * Resize handles depend on the element's display / anchor (computed by
 * `computeResizeHandles`) — some layouts only afford resizing on certain
 * sides. **Rotate handles are always rendered on all four corners**, Figma-
 * style, regardless of which (if any) resize handles are visible. Any selected
 * element with a paintable box can be rotated, so the rotation affordance is
 * unconditional; the rotate cursor (the curved double-arrow) appears whenever
 * the pointer enters one of the four corner rotate bands.
 *
 * Each corner carries two stacked hit areas:
 *  - **Rotate** — the larger band that extends a few px diagonally outside the
 *    corner, with a rotate cursor. Rendered first so it sits *under* the
 *    resize square.
 *  - **Resize** — the small inner square that catches a direct grab (only
 *    drawn for corners the layout actually allows resizing from).
 *
 * Color matches the selection-rect border in Selection.tsx so the rect and
 * its handles read as one shape.
 */

const HANDLE_BORDER = '#4f46e5'
const HANDLE_FILL = '#ffffff'
const CORNER_SIZE = 8
const EDGE_GRAB_THICKNESS = 10
const ROTATE_HIT_SIZE = 22

const CURSOR_BY_CORNER: Record<HandleCorner, string> = {
  tl: 'nwse-resize',
  br: 'nwse-resize',
  tr: 'nesw-resize',
  bl: 'nesw-resize',
}

const CURSOR_BY_SIDE: Record<HandleSide, string> = {
  top: 'ns-resize',
  bottom: 'ns-resize',
  left: 'ew-resize',
  right: 'ew-resize',
}

/** All four corners — rotate handles render at each unconditionally. */
const ALL_CORNERS: readonly HandleCorner[] = ['tl', 'tr', 'br', 'bl']

// Custom rotate cursor — a Figma-style curved double-arrow: a downward-bowing
// arc with arrowhead V's at each end. The whole shape is rotated per-corner
// (see ROTATE_CURSORS below) so the arc always bows *outward* from the
// element and the arrowheads sit along the rotation tangent at that corner.
// White halo + black stroke keep it readable on any background. 24×24 with
// hot-spot at (12,12) so per-corner rotation pivots around the centre.
const ROTATE_PATH =
  'M6 6 L3 9 L6 12' +          // left arrowhead V — apex at (3,9), points left
  ' M3 9 Q12 15 21 9' +        // arc bowing down between the two arrow apices
  ' M21 9 L18 6' +             // right arrowhead stroke 1 (apex at (21,9))
  ' M21 9 L18 12'              // right arrowhead stroke 2

function makeRotateCursor(rotationDeg: number): string {
  // Rotate the whole glyph around the hot-spot (12,12) so the keyword cursor
  // fallback ("grab") still lands at the right place if SVG fails to load.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
    `<g transform="rotate(${rotationDeg} 12 12)" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="${ROTATE_PATH}" stroke="white" stroke-width="3"/>` +
    `<path d="${ROTATE_PATH}" stroke="black" stroke-width="1.5"/>` +
    `</g></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 12 12, grab`
}

/** Per-corner rotation of the cursor glyph. Chosen so the arc bows *outward*
 *  from the element (down at BR, up-left at TL, etc.) and the arrows sit
 *  along the rotational tangent at that corner. */
const ROTATE_CURSORS: Record<HandleCorner, string> = {
  tl: makeRotateCursor(135),
  tr: makeRotateCursor(-135),
  br: makeRotateCursor(-45),
  bl: makeRotateCursor(45),
}

export function ResizeHandles({
  rect,
  element,
  getMultiEditPeers,
}: {
  rect: Rect
  element: Element
  /** Peer elements that should mirror this drag in multi-edit mode. Resolved
   *  at gesture start; empty array → single-edit drag. */
  getMultiEditPeers?: () => HTMLElement[]
}) {
  if (!(element instanceof HTMLElement)) return null

  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    transform: `rotate(${rect.rotation}deg)`,
    transformOrigin: '50% 50%',
    pointerEvents: 'none',
    zIndex: 1002,
  }

  const cs = getComputedStyle(element)
  // Nothing to draw a handle around for `display: none` / `contents` — they
  // have no box. Everything else (including inline, table cells, content-sized
  // boxes) can still be rotated, so the rotate handles render.
  if (cs.display === 'none' || cs.display === 'contents') return null

  const inputs: DisplayInputs = { display: cs.display, position: cs.position }
  // Always treat both axes as explicit — Figma shows resize handles for
  // content-sized boxes too, and the px write at drag time promotes the
  // element to a fixed dimension. See tech-specs/drag-to-resize.md §4.
  const layout = computeResizeHandles(inputs, resolveAnchor(element), {
    hasExplicitWidth: true,
    hasExplicitHeight: true,
  })

  return (
    <div style={containerStyle}>
      {/* Rotate hit areas first so the resize squares overlay them on the
          corners that DO get a resize handle. Rendered for all 4 corners
          regardless of `layout.corners` — rotation is unconditional. */}
      {ALL_CORNERS.map(corner => (
        <RotateCornerHandle
          key={`rot-${corner}`}
          corner={corner}
          element={element}
          getMultiEditPeers={getMultiEditPeers}
        />
      ))}
      {layout.edges.map(side => (
        <EdgeBand
          key={side}
          side={side}
          element={element}
          rotationDeg={rect.rotation}
          getMultiEditPeers={getMultiEditPeers}
        />
      ))}
      {layout.corners.map(corner => (
        <CornerHandle
          key={corner}
          corner={corner}
          element={element}
          rotationDeg={rect.rotation}
          getMultiEditPeers={getMultiEditPeers}
        />
      ))}
      <RotationDragLabel element={element} />
    </div>
  )
}

/**
 * Live "Rotate {n}°" pill rendered while the user is mid-rotate. Subscribes
 * to `pixel-drag-frame` so the label tracks every frame of the gesture,
 * and reads the angle through `getActiveRotateDrag()` rather than a prop so
 * the label updates without re-rendering the whole `ResizeHandles` subtree.
 *
 * Anchored to the element's pre-rotation centre (top: 0, left: 50%) so the
 * pill stays just above the element's bounding box as it spins — it sits
 * inside a container that already carries the element's `transform: rotate`,
 * so a `counter-rotate` keeps the text readable horizontally.
 */
function RotationDragLabel({ element }: { element: HTMLElement }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    function bump() { setTick(t => t + 1) }
    document.addEventListener('pixel-drag-frame', bump)
    return () => document.removeEventListener('pixel-drag-frame', bump)
  }, [])
  const drag = getActiveRotateDrag()
  if (!drag || drag.element !== element) return null
  // Normalise to (-180, 180] for legibility — anything outside is just a wrap.
  const normalised = ((drag.rotationDeg + 540) % 360) - 180
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: -28,
        left: '50%',
        // The container is rotated with the element; counter-rotate so the
        // label reads horizontal regardless of the live angle.
        transform: `translateX(-50%) rotate(${-drag.rotationDeg}deg)`,
        transformOrigin: 'center bottom',
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
      Rotate {normalised.toFixed(1)}°
    </div>
  )
}

function CornerHandle({
  corner,
  element,
  rotationDeg,
  getMultiEditPeers,
}: {
  corner: HandleCorner
  element: HTMLElement
  rotationDeg: number
  getMultiEditPeers?: () => HTMLElement[]
}) {
  const top = corner === 'tl' || corner === 'tr'
  const left = corner === 'tl' || corner === 'bl'
  const cursor = CURSOR_BY_CORNER[corner]
  return (
    <div
      data-resize-handle="corner"
      data-corner={corner}
      onPointerDown={e =>
        beginResize(e, { element, corner, cursor, rotationDeg, getMultiEditPeers })
      }
      style={{
        position: 'absolute',
        top: top ? 0 : '100%',
        left: left ? 0 : '100%',
        width: CORNER_SIZE,
        height: CORNER_SIZE,
        marginTop: -CORNER_SIZE / 2,
        marginLeft: -CORNER_SIZE / 2,
        background: HANDLE_FILL,
        border: `1px solid ${HANDLE_BORDER}`,
        boxSizing: 'border-box',
        cursor,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    />
  )
}

function EdgeBand({
  side,
  element,
  rotationDeg,
  getMultiEditPeers,
}: {
  side: HandleSide
  element: HTMLElement
  rotationDeg: number
  getMultiEditPeers?: () => HTMLElement[]
}) {
  const cursor = CURSOR_BY_SIDE[side]
  const thickness = EDGE_GRAB_THICKNESS
  const style: CSSProperties =
    side === 'top'
      ? { left: 0, top: 0, width: '100%', height: thickness }
      : side === 'bottom'
        ? { left: 0, top: `calc(100% - ${thickness}px)`, width: '100%', height: thickness }
        : side === 'left'
          ? { left: 0, top: 0, width: thickness, height: '100%' }
          : { left: `calc(100% - ${thickness}px)`, top: 0, width: thickness, height: '100%' }
  return (
    <div
      data-resize-handle="edge"
      data-side={side}
      onPointerDown={e =>
        beginResize(e, { element, side, cursor, rotationDeg, getMultiEditPeers })
      }
      style={{
        position: 'absolute',
        ...style,
        background: 'transparent',
        cursor,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    />
  )
}

function RotateCornerHandle({
  corner,
  element,
  getMultiEditPeers,
}: {
  corner: HandleCorner
  element: HTMLElement
  getMultiEditPeers?: () => HTMLElement[]
}) {
  const top = corner === 'tl' || corner === 'tr'
  const left = corner === 'tl' || corner === 'bl'
  // Corner-specific cursor — the glyph rotates so its arc bows outward and
  // its arrows sit along the rotation tangent at this corner.
  const cursor = ROTATE_CURSORS[corner]
  return (
    <div
      data-resize-handle="rotate"
      data-corner={corner}
      onPointerDown={e => beginRotate(e, element, cursor, getMultiEditPeers)}
      style={{
        position: 'absolute',
        top: top ? 0 : '100%',
        left: left ? 0 : '100%',
        // Wide band centred on the corner; the resize square (8×8) overlaps
        // the centre, so the visible "rotate zone" is the L-shape just outside
        // the corner — like Figma. No inner marker needed; the resize handle
        // itself is the corner indicator.
        width: ROTATE_HIT_SIZE,
        height: ROTATE_HIT_SIZE,
        marginTop: -ROTATE_HIT_SIZE / 2,
        marginLeft: -ROTATE_HIT_SIZE / 2,
        background: 'transparent',
        cursor,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    />
  )
}

interface BeginResizeInput {
  element: HTMLElement
  side?: HandleSide
  corner?: HandleCorner
  cursor: string
  rotationDeg: number
  getMultiEditPeers?: () => HTMLElement[]
}

function beginResize(e: ReactPointerEvent<HTMLDivElement>, input: BeginResizeInput): void {
  if (e.button !== 0) return
  // A double-click on the handle over a text element opens inline editing
  // instead of resizing — the handle overlays the text, so without this the
  // edge / corner would swallow the gesture.
  if (maybeBeginInlineEditFromHandle(input.element)) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  // stopPropagation so the selection's `pointerdown outside host` handler
  // (on canvasPane) doesn't clear the selection out from under us.
  e.preventDefault()
  e.stopPropagation()
  startResizeDrag({
    element: input.element,
    side: input.side,
    corner: input.corner,
    startX: e.clientX,
    startY: e.clientY,
    rotationDeg: input.rotationDeg,
    cursor: input.cursor,
    peers: input.getMultiEditPeers?.() ?? [],
  })
}

function beginRotate(
  e: ReactPointerEvent<HTMLDivElement>,
  element: HTMLElement,
  cursor: string,
  getMultiEditPeers?: () => HTMLElement[],
): void {
  if (e.button !== 0) return
  if (maybeBeginInlineEditFromHandle(element)) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  e.preventDefault()
  e.stopPropagation()
  startRotateDrag({
    element,
    startX: e.clientX,
    startY: e.clientY,
    cursor,
    peers: getMultiEditPeers?.() ?? [],
  })
}
