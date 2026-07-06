import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { getViewportScale } from '../canvas/viewport'
import { COLORS, FONT_SIZE, FONTS, RADIUS } from '../design-system'
import type { Rect } from '../selection/selection-utils'
import { isDragging as isResizeOrRotateDragging } from './drag-session'
import { maybeBeginInlineEditFromHandle } from './handle-inline-edit'
import { getActiveSpacingDrag, startSpacingDrag, type SpacingAxis } from './spacing-drag'
import { setSnapTargets } from './token-snap'
import { tokenDisplayLabel } from '../properties-sidebar/token-mapping'
import { useTokenMatch } from '../properties-sidebar/useTokenMatch'
import type { Token } from '../pixel-common'

/** Match a raw px value to a spacing token and return the picker-consistent
 *  bare display name (e.g. `space-3`), or null. Shared by the padding/margin
 *  and gap labels so the on-canvas badge matches the design pane + radius. */
type MatchToken = (value: string) => Token | null
function spacingTokenLabel(matchToken: MatchToken, value: number): string | null {
  return tokenDisplayLabel(matchToken(`${Math.round(value)}px`))
}

/**
 * Figma-style spacing handles drawn over the selected element:
 *  - **padding** bars sit on the inner edges (teal); drag toward the centre to
 *    grow that side's padding.
 *  - **gap** bars sit between flex children (teal); drag along the main axis to
 *    grow the gap.
 *  - **margin** bars sit just outside each edge (blue); drag outward to grow
 *    that side's margin.
 *
 * Each bar starts a `spacing-drag` gesture, which writes the inline value live
 * and commits one change on pointer up. Rendered above `ResizeHandles` in the
 * stack so margin/padding/gap handles win at any overlap. Skipped while the
 * element is rotated — the bars assume an axis-aligned box.
 *
 * Visual position vs. hit area (see screenshots in canvas.md §4):
 *   The visible bar always sits at the *true* offset from the element edge —
 *   right on the edge when the value is 0. The **hit area** is a separate,
 *   wider invisible div extended ~3px in the bar's owning direction (inward
 *   for padding, outward for margin) so the padding and margin bars stay
 *   independently grabbable at 0 even though they overlap visually.
 *
 * Zoom-correctness: positions and band thicknesses scale with the canvas
 * viewport so they line up with the live DOM at any zoom. The label always
 * reads the element's *true* CSS px value.
 */

/** Visible bar thickness (perpendicular to the drag axis). 1 screen px —
 *  Figma's tick-style affordance. */
const BAR = 1
/** Visible bar length (along the drag axis). 4 screen px — same Figma scale. */
const BAR_LENGTH = 4
/** Invisible hit-area extension past the bar in the *owning* direction
 *  (inward for padding, outward for margin) — screen px, constant at any zoom
 *  so the 1×4 visual stays comfortably grabbable. */
const HIT_OFFSET = 4
/** Invisible hit-area extension along the bar's long axis, both sides — the
 *  visible bar is only 4px long, so we pad to ~16px of clickable length. */
const HIT_ALONG = 6
/** Gap between the bar and its value label, in screen px. */
const LABEL_GAP = 6
/** Minimum offset (screen px) of a padding/margin handle from the element edge,
 *  regardless of how small the actual value is. When padding *and* margin are 0
 *  both bars would otherwise pile onto the edge and — sitting above the resize
 *  overlay (zIndex 1003 > 1002) — steal the side resize handle. Pushing padding
 *  in / margin out by at least this much leaves a grabbable strip at the very
 *  edge for the resize band. The label always reads the element's *true* value,
 *  so a 0 still reads "0". */
const MIN_HANDLE_OFFSET = 3
/** Milliseconds the pointer must rest over the selected element (or its margin
 *  band) before the handles appear — Figma's reveal delay. */
const HOVER_DELAY_MS = 300
/** Extra screen-px buffer added to the element's hover trigger box so the
 *  pointer can travel from the element body to a bar without losing hover. */
const HOVER_PAD = 8

type Side = 'top' | 'right' | 'bottom' | 'left'
type Kind = 'padding' | 'margin'

interface SideSpec {
  side: Side
  axis: SpacingAxis
  /** Sign for *padding* (drag toward centre → grow). Margin uses the inverse. */
  padSign: 1 | -1
  cursor: string
}

const SIDES: SideSpec[] = [
  { side: 'top',    axis: 'y', padSign: 1,  cursor: 'ns-resize' },
  { side: 'bottom', axis: 'y', padSign: -1, cursor: 'ns-resize' },
  { side: 'left',   axis: 'x', padSign: 1,  cursor: 'ew-resize' },
  { side: 'right',  axis: 'x', padSign: -1, cursor: 'ew-resize' },
]

/** Re-render on every drag frame so handle positions track the live element,
 *  and so the label/band update during drag. */
function useDragFrame(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    function bump() { setTick(t => t + 1) }
    document.addEventListener('pixel-drag-frame', bump)
    return () => document.removeEventListener('pixel-drag-frame', bump)
  }, [])
}

function px(value: string): number {
  return parseFloat(value) || 0
}

export function SpacingHandles({
  rect,
  element,
  getMultiEditPeers,
}: {
  rect: Rect
  element: Element
  getMultiEditPeers?: () => HTMLElement[]
}) {
  useDragFrame()
  // Publish spacing tokens to the drag registry so on-canvas padding/margin/gap
  // drags can snap to them (the drag sessions are non-React). One spacing kind
  // covers padding, margin and gap.
  const spacingMatch = useTokenMatch('padding-top')
  useEffect(() => {
    setSnapTargets(
      'spacing',
      spacingMatch.snapTargets.map(t => ({ value: t.numericValue, token: t.token })),
    )
  }, [spacingMatch.snapTargets])
  // Reveal logic — the handles only render after the pointer has rested over
  // the element (or its margin band, plus a small buffer so the user can
  // travel to a bar) for `HOVER_DELAY_MS`. An active spacing drag forces them
  // visible so they can't disappear while the user is dragging outside the
  // trigger area. Cleared instantly when the pointer leaves.
  const [hoveringElement, setHoveringElement] = useState(false)
  const [delayed, setDelayed] = useState(false)

  useEffect(() => {
    if (!(element instanceof HTMLElement)) return
    function onMove(e: PointerEvent) {
      if (isResizeOrRotateDragging()) {
        setHoveringElement(false)
        return
      }
      const r = (element as HTMLElement).getBoundingClientRect()
      const cs = getComputedStyle(element)
      // Margin in CSS px, scaled to screen px for hit-testing against the
      // (already-scaled) bounding rect.
      const sc = getViewportScale() || 1
      const ml = px(cs.marginLeft)   * sc
      const mr = px(cs.marginRight)  * sc
      const mt = px(cs.marginTop)    * sc
      const mb = px(cs.marginBottom) * sc
      const inside =
        e.clientX >= r.left   - ml - HOVER_PAD &&
        e.clientX <= r.right  + mr + HOVER_PAD &&
        e.clientY >= r.top    - mt - HOVER_PAD &&
        e.clientY <= r.bottom + mb + HOVER_PAD
      setHoveringElement(prev => (prev === inside ? prev : inside))
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [element])

  useEffect(() => {
    if (!hoveringElement) {
      setDelayed(false)
      return
    }
    const t = window.setTimeout(() => setDelayed(true), HOVER_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [hoveringElement])

  if (!(element instanceof HTMLElement)) return null
  if (Math.round(rect.rotation) !== 0) return null
  // Resize / rotate gestures own the pointer — suppress spacing hover chrome.
  if (isResizeOrRotateDragging()) return null

  // Force-visible while any spacing drag is active on this element so the
  // bars don't blink off as the pointer leaves the trigger area mid-drag.
  const drag = getActiveSpacingDrag()
  const dragActive = !!drag && drag.element === element
  if (!delayed && !dragActive) return null

  const cs = getComputedStyle(element)
  const W = rect.width
  const H = rect.height
  // Spacing values in CSS px (read from the element). Used as-is for labels;
  // scaled by the viewport for positioning, since the overlay lives in screen
  // space and `rect.{width,height}` are already scaled.
  const pad: Record<Side, number> = {
    top: px(cs.paddingTop), right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom), left: px(cs.paddingLeft),
  }
  const mar: Record<Side, number> = {
    top: px(cs.marginTop), right: px(cs.marginRight),
    bottom: px(cs.marginBottom), left: px(cs.marginLeft),
  }
  const scale = getViewportScale() || 1

  const containerStyle: CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: W,
    height: H,
    // Container itself is non-interactive; each Bar's hit-area div re-enables
    // pointer events on its own footprint.
    pointerEvents: 'none',
    // Above ResizeHandles (1002) so spacing handles win any overlap with the
    // resize edge bands. Margin bars sit *outside* the element rect and never
    // overlapped the resize bands, so they already won by geometry; padding
    // bars sit just *inside* the edge and would otherwise be stolen by the
    // resize EdgeBand. This makes padding (and gap) take precedence too —
    // matching the file-header contract and Figma's behaviour.
    zIndex: 1003,
  }

  return (
    <div style={containerStyle}>
      {SIDES.map(spec => (
        <Bar
          key={`pad-${spec.side}`}
          kind="padding"
          spec={spec}
          point={paddingPoint(spec.side, W, H, pad, scale)}
          value={pad[spec.side]}
          W={W}
          H={H}
          scale={scale}
          element={element}
          matchToken={spacingMatch.matchToken}
          getMultiEditPeers={getMultiEditPeers}
        />
      ))}
      {SIDES.map(spec => (
        <Bar
          key={`mar-${spec.side}`}
          kind="margin"
          spec={spec}
          point={marginPoint(spec.side, W, H, mar, scale)}
          value={mar[spec.side]}
          W={W}
          H={H}
          scale={scale}
          element={element}
          matchToken={spacingMatch.matchToken}
          getMultiEditPeers={getMultiEditPeers}
        />
      ))}
      <GapHandles
        rect={rect}
        element={element}
        cs={cs}
        scale={scale}
        matchToken={spacingMatch.matchToken}
        getMultiEditPeers={getMultiEditPeers}
      />
    </div>
  )
}

/** Padding bar position — offset *inward* from the element edge by the padding
 *  value, but at least `MIN_HANDLE_OFFSET` so it never buries the side resize
 *  handle at the edge. So a 5px padding sits at 5px; a 1px (or 0) padding sits
 *  at 3px. */
function paddingPoint(side: Side, W: number, H: number, pad: Record<Side, number>, scale: number): { x: number; y: number } {
  const off = (v: number) => Math.max(v * scale, MIN_HANDLE_OFFSET)
  switch (side) {
    case 'top':    return { x: W / 2, y: off(pad.top) }
    case 'bottom': return { x: W / 2, y: H - off(pad.bottom) }
    case 'left':   return { x: off(pad.left), y: H / 2 }
    case 'right':  return { x: W - off(pad.right), y: H / 2 }
  }
}

/** Margin bar position — offset *outward* from the element edge by the margin
 *  value, but at least `MIN_HANDLE_OFFSET` (same rationale as `paddingPoint`)
 *  so the padding-0 / margin-0 bars don't both pile onto the edge and steal the
 *  resize handle. */
function marginPoint(side: Side, W: number, H: number, mar: Record<Side, number>, scale: number): { x: number; y: number } {
  const off = (v: number) => Math.max(v * scale, MIN_HANDLE_OFFSET)
  switch (side) {
    case 'top':    return { x: W / 2, y: -off(mar.top) }
    case 'bottom': return { x: W / 2, y: H + off(mar.bottom) }
    case 'left':   return { x: -off(mar.left), y: H / 2 }
    case 'right':  return { x: W + off(mar.right), y: H / 2 }
  }
}

/** Pixel rect for the hover/drag band — the strip of padding or margin area
 *  on the given side. Zero when the value is 0 (nothing to highlight). */
function bandRect(
  kind: Kind,
  side: Side,
  W: number,
  H: number,
  value: number,
  scale: number,
  minScreenPx: number,
): { left: number; top: number; width: number; height: number } | null {
  const t = Math.max(value * scale, minScreenPx)
  if (t <= 0) return null
  switch (side) {
    case 'top':
      return kind === 'padding'
        ? { left: 0, top: 0,  width: W, height: t }
        : { left: 0, top: -t, width: W, height: t }
    case 'bottom':
      return kind === 'padding'
        ? { left: 0, top: H - t, width: W, height: t }
        : { left: 0, top: H,     width: W, height: t }
    case 'left':
      return kind === 'padding'
        ? { left: 0,  top: 0, width: t, height: H }
        : { left: -t, top: 0, width: t, height: H }
    case 'right':
      return kind === 'padding'
        ? { left: W - t, top: 0, width: t, height: H }
        : { left: W,     top: 0, width: t, height: H }
  }
}

/** Hit-area rect — pads the visible bar by `HIT_ALONG` on both sides of its
 *  long axis (so the 4px-long bar gets ~16px of clickable length) and by
 *  `HIT_OFFSET` asymmetrically perpendicular, in the owning direction.
 *  Padding owns inward; margin owns outward. */
function hitAreaRect(
  kind: Kind,
  spec: SideSpec,
  point: { x: number; y: number },
  len: number,
): { left: number; top: number; width: number; height: number } {
  const horizontal = spec.axis === 'y'
  if (horizontal) {
    // Bar lies on top/bottom edge; owning axis is y.
    const inward = spec.side === 'top' ? +1 : -1 // +y for top, -y for bottom
    const dir = kind === 'padding' ? inward : -inward
    const halfBar = BAR / 2
    return {
      left: point.x - len / 2 - HIT_ALONG,
      top: dir > 0 ? point.y - halfBar : point.y - halfBar - HIT_OFFSET,
      width: len + HIT_ALONG * 2,
      height: BAR + HIT_OFFSET,
    }
  } else {
    // Bar lies on left/right edge; owning axis is x.
    const inward = spec.side === 'left' ? +1 : -1
    const dir = kind === 'padding' ? inward : -inward
    const halfBar = BAR / 2
    return {
      left: dir > 0 ? point.x - halfBar : point.x - halfBar - HIT_OFFSET,
      top: point.y - len / 2 - HIT_ALONG,
      width: BAR + HIT_OFFSET,
      height: len + HIT_ALONG * 2,
    }
  }
}

function Bar({
  kind,
  spec,
  point,
  value,
  W,
  H,
  scale,
  element,
  matchToken,
  getMultiEditPeers,
}: {
  kind: Kind
  spec: SideSpec
  point: { x: number; y: number }
  value: number
  W: number
  H: number
  scale: number
  element: HTMLElement
  matchToken: MatchToken
  getMultiEditPeers?: () => HTMLElement[]
}) {
  const [hovered, setHovered] = useState(false)
  const horizontal = spec.axis === 'y'
  const property = `${kind}-${spec.side}`
  const sign = (kind === 'padding' ? spec.padSign : (-spec.padSign as 1 | -1))
  // Fixed Figma-style affordance: 1px × 4px visible. Hit area is enlarged
  // by `HIT_ALONG` on both sides along the long axis (and `HIT_OFFSET`
  // asymmetrically perpendicular, see `hitAreaRect`).
  const len = BAR_LENGTH

  const drag = getActiveSpacingDrag()
  // `draggingThis` is true for every bar currently in the active mirror set,
  // not just the originally-grabbed one — so alt-drag of padding-right lights
  // up padding-left, and alt+shift lights up all four sides of the kind.
  const draggingThis = !!drag && drag.element === element && drag.properties.has(property)
  const dragSomethingElse = !!drag && !draggingThis
  // `isDragOrigin` is only the bar the user actually grabbed (`baseProperty`),
  // not the mirrored sides an alt / alt+shift drag also drives — the label
  // shows only here so a mirror drag reads as one value pill, not two/four.
  const isDragOrigin = !!drag && drag.element === element && drag.baseProperty === property
  // Live value while this bar is being dragged. All mirrored sides share the
  // same value by construction (the session writes one px to every property
  // in the active set per frame), so reading `drag.value` is correct here.
  const liveValue = draggingThis ? drag!.value : value

  // Show the striped band on hover only (no drag), and only when there's an
  // actual spacing region to fill (value > 0). When dragging this bar we hide
  // the band on purpose — the cursor is the focal point, the label carries
  // the value, an animated band would just be visual noise.
  const showBand = hovered && !drag && (kind === 'margin' || value > 0)
  // Show the label whenever the user is paying attention to this bar — hover
  // or being the grabbed bar of an active drag. Suppressed while another bar is
  // being dragged, and on mirrored (non-origin) sides so only one pill shows.
  const showLabel = (hovered && !dragSomethingElse) || isDragOrigin

  const color = kind === 'padding' ? COLORS.spacingPadding : COLORS.spacingMargin
  const fill  = kind === 'padding' ? COLORS.spacingPaddingFill : COLORS.spacingMarginFill

  const hit = hitAreaRect(kind, spec, point, len)
  const band = showBand ? bandRect(kind, spec.side, W, H, value, scale, kind === 'margin' ? 1 : 0) : null
  const barThickness = kind === 'margin' && hovered && !dragSomethingElse ? 2 : BAR

  return (
    <>
      {band && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: band.left,
            top: band.top,
            width: band.width,
            height: band.height,
            background: stripedBackground(fill),
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Visible bar — true position, click-through (hit area below owns input). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: point.x - (horizontal ? len / 2 : barThickness / 2),
          top:  point.y - (horizontal ? barThickness / 2 : len / 2),
          width:  horizontal ? len : barThickness,
          height: horizontal ? barThickness : len,
          background: color,
          borderRadius: barThickness / 2,
          pointerEvents: 'none',
          opacity: draggingThis ? 1 : 0.85,
        }}
      />
      {/* Hit area — invisible, asymmetrically extended in the owning direction. */}
      <div
        data-spacing-handle={kind}
        title={`${property}: ${liveValue}px — drag to adjust`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={e =>
          begin(e, { element, property, axis: spec.axis, sign, cursor: spec.cursor, getMultiEditPeers })
        }
        style={{
          position: 'absolute',
          left: hit.left,
          top: hit.top,
          width: hit.width,
          height: hit.height,
          cursor: spec.cursor,
          pointerEvents: 'auto',
          touchAction: 'none',
          background: 'transparent',
        }}
      />
      {showLabel && (
        <SpacingLabel
          kind={kind}
          spec={spec}
          point={point}
          len={len}
          value={Math.round(liveValue)}
          tokenName={spacingTokenLabel(matchToken, liveValue)}
          color={color}
        />
      )}
    </>
  )
}

/** Diagonal-stripe fill, Figma-style. Lighter base + darker stripes on top —
 *  both driven by the same translucent token so padding/margin colors stay
 *  in family. */
function stripedBackground(fill: string): string {
  return (
    `repeating-linear-gradient(45deg, ${fill} 0 3px, transparent 3px 7px), ${fill}`
  )
}

function SpacingLabel({
  kind,
  spec,
  point,
  len,
  value,
  tokenName,
  color,
}: {
  kind: Kind
  spec: SideSpec
  point: { x: number; y: number }
  /** Visible bar length (along its long axis). */
  len: number
  value: number
  /** Bare token name when the value coincides with a spacing token, else null. */
  tokenName: string | null
  color: string
}) {
  // Place the label adjacent to the bar in its long-axis direction, outside
  // the bar's footprint so it never sits on top of the handle. Picking the
  // owning side keeps the label clear of the element / its other bars.
  const horizontal = spec.axis === 'y'
  // Visible bar end (in the long-axis direction).
  let left = 0, top = 0
  let transform = 'translate(-50%, -100%)'
  if (horizontal) {
    // Bar runs horizontally; place label above (top side) or below (bottom).
    left = point.x
    if (spec.side === 'top') {
      top = point.y - BAR / 2 - LABEL_GAP
      transform = 'translate(-50%, -100%)'
    } else {
      top = point.y + BAR / 2 + LABEL_GAP
      transform = 'translate(-50%, 0)'
    }
  } else {
    // Bar runs vertically; place label past one short end.
    top = point.y - len / 2 - LABEL_GAP
    left = point.x
    transform = 'translate(-50%, -100%)'
  }
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left,
        top,
        transform,
        background: color,
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
      {kind} {value}{tokenName ? ` · ${tokenName}` : ''}
    </div>
  )
}

function GapHandles({
  rect,
  element,
  cs,
  scale,
  matchToken,
  getMultiEditPeers,
}: {
  rect: Rect
  element: HTMLElement
  cs: CSSStyleDeclaration
  scale: number
  matchToken: MatchToken
  getMultiEditPeers?: () => HTMLElement[]
}) {
  if (!cs.display.includes('flex')) return null
  const column = cs.flexDirection.startsWith('column')
  const property = column ? 'row-gap' : 'column-gap'
  const gapValue = Math.round(px(cs.getPropertyValue(property)))
  const cursor = column ? 'ns-resize' : 'ew-resize'

  const children = Array.from(element.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && getComputedStyle(c).display !== 'none',
  )
  if (children.length < 2) return null

  const drag = getActiveSpacingDrag()
  // `properties.has(property)` covers the alt-locks-both-gaps mirror case
  // (e.g. dragging row-gap with alt also drives column-gap).
  const draggingThis = !!drag && drag.element === element && drag.properties.has(property)
  const liveValue = draggingThis ? drag!.value : gapValue
  // The label shows the automatic value (the spread mode) instead of a px value
  // whenever the container's gap is automatic — on hover from the container's
  // current justify-content, and while dragging from the live cycling mode. A
  // ⌘-drag that converts to px clears `drag.spreadMode`, so px shows through.
  const jc = cs.justifyContent
  const restingSpread = jc.includes('between')
    ? 'space-between'
    : jc.includes('around')
      ? 'space-around'
      : jc.includes('evenly')
        ? 'space-evenly'
        : null
  const spreadMode = draggingThis ? drag!.spreadMode : restingSpread

  return (
    <>
      {Array.from({ length: children.length - 1 }, (_, i) => {
        const a = children[i].getBoundingClientRect()
        const b = children[i + 1].getBoundingClientRect()
        const x = column ? rect.width / 2 : (a.right + b.left) / 2 - rect.left
        const y = column ? (a.bottom + b.top) / 2 - rect.top : rect.height / 2
        const len = BAR_LENGTH
        return (
          <GapBar
            key={`gap-${i}`}
            x={x}
            y={y}
            column={column}
            len={len}
            value={liveValue}
            spreadMode={spreadMode}
            property={property}
            cursor={cursor}
            element={element}
            draggingThis={draggingThis}
            dragSomethingElse={!!drag && !draggingThis}
            scale={scale}
            matchToken={matchToken}
            getMultiEditPeers={getMultiEditPeers}
          />
        )
      })}
    </>
  )
}

function GapBar({
  x, y, column, len, value, spreadMode, property, cursor, element,
  draggingThis, dragSomethingElse, scale, matchToken, getMultiEditPeers,
}: {
  x: number; y: number; column: boolean; len: number; value: number;
  spreadMode: string | null;
  property: string; cursor: string; element: HTMLElement;
  draggingThis: boolean; dragSomethingElse: boolean; scale: number;
  matchToken: MatchToken;
  getMultiEditPeers?: () => HTMLElement[];
}) {
  const [hovered, setHovered] = useState(false)
  // Gap "band" is the strip between the two children (along the gap axis).
  const t = value * scale
  const showBand = hovered && !draggingThis && !dragSomethingElse && t > 0
  const showLabel = (hovered && !dragSomethingElse) || draggingThis
  const fill = COLORS.spacingPaddingFill
  const color = COLORS.spacingPadding
  return (
    <>
      {showBand && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: column ? 0 : x - t / 2,
            top:  column ? y - t / 2 : 0,
            width:  column ? '100%' : t,
            height: column ? t : '100%',
            background: stripedBackground(fill),
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Visible bar */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: x - (column ? len / 2 : BAR / 2),
          top:  y - (column ? BAR / 2 : len / 2),
          width:  column ? len : BAR,
          height: column ? BAR : len,
          background: color,
          borderRadius: BAR / 2,
          pointerEvents: 'none',
          opacity: draggingThis ? 1 : 0.85,
        }}
      />
      {/* Hit area: extend along gap axis equally on both sides (no owning
          direction conflict to disambiguate — only one gap bar per spot). */}
      <div
        data-spacing-handle="gap"
        title={`${property}: ${value}px — drag to adjust`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={e =>
          begin(e, { element, property, axis: column ? 'y' : 'x', sign: 1, cursor, getMultiEditPeers })
        }
        style={{
          position: 'absolute',
          // Hit area pads the bar by HIT_ALONG along its long axis (both
          // sides) and HIT_OFFSET perpendicular (both sides — no inward /
          // outward distinction needed since there's only one gap bar per
          // location).
          left: column ? x - len / 2 - HIT_ALONG : x - BAR / 2 - HIT_OFFSET,
          top:  column ? y - BAR / 2 - HIT_OFFSET : y - len / 2 - HIT_ALONG,
          width:  column ? len + HIT_ALONG * 2 : BAR + HIT_OFFSET * 2,
          height: column ? BAR + HIT_OFFSET * 2 : len + HIT_ALONG * 2,
          cursor,
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      />
      {showLabel && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: x,
            top:  column ? y - BAR / 2 - LABEL_GAP : y - len / 2 - LABEL_GAP,
            transform: 'translate(-50%, -100%)',
            background: color,
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
          {spreadMode
            ? spreadMode
            : `gap ${Math.round(value)}${(() => { const t = spacingTokenLabel(matchToken, value); return t ? ` · ${t}` : '' })()}`}
        </div>
      )}
    </>
  )
}

interface BeginInput {
  element: HTMLElement
  property: string
  axis: SpacingAxis
  sign: 1 | -1
  cursor: string
  getMultiEditPeers?: () => HTMLElement[]
}

function begin(e: ReactPointerEvent<HTMLDivElement>, input: BeginInput): void {
  if (e.button !== 0) return
  // Double-click over a text element's padding/margin/gap bar opens inline
  // editing instead of dragging spacing — the bars hover over the text edges.
  if (maybeBeginInlineEditFromHandle(input.element)) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  // stopPropagation so the canvas pointerdown handler doesn't clear selection.
  e.preventDefault()
  e.stopPropagation()
  startSpacingDrag({
    element: input.element,
    property: input.property,
    axis: input.axis,
    sign: input.sign,
    startX: e.clientX,
    startY: e.clientY,
    cursor: input.cursor,
    peers: input.getMultiEditPeers?.() ?? [],
  })
}
