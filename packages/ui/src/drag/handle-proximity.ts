/**
 * Closest-handle selection — when resize / rotate / radius / spacing hit
 * targets crowd on a small element, pick the handle whose hit geometry is
 * nearest the pointer (with a small-target tie-break) so the user can reach
 * size handles without radius (or padding) permanently stealing the grab.
 *
 * Pure geometry; React overlays gate `pointer-events` from the winner id.
 */

import type { Rect } from '../selection/selection-utils'
import type { HandleCorner, HandleLayout, HandleSide } from './handle-layout'

/** Match Handles.tsx / CornerRadiusHandles / SpacingHandles hit sizes. */
export const CORNER_SIZE = 8
export const EDGE_GRAB_THICKNESS = 10
export const ROTATE_HIT_SIZE = 22
export const RADIUS_DOT_SIZE = 8
export const RADIUS_HIT_PAD = 5
export const RADIUS_CORNER_INSET = 8
export const SPACING_BAR = 1
export const SPACING_BAR_LENGTH = 4
export const SPACING_HIT_OFFSET = 4
export const SPACING_HIT_ALONG = 6
export const SPACING_MIN_OFFSET = 3

/** Keep the current winner until another is this many px closer (reduces flicker). */
export const PROXIMITY_HYSTERESIS_PX = 2
/** Ignore handles farther than this from the pointer (screen px). */
export const PROXIMITY_MAX_GRAB_PX = 28

export type HandleKind =
  | 'resize-corner'
  | 'resize-edge'
  | 'rotate'
  | 'radius'
  | 'padding'
  | 'margin'
  | 'gap'

/** Lower wins ties when distances are equal / within epsilon. */
const PRIORITY: Record<HandleKind, number> = {
  radius: 0,
  padding: 1,
  margin: 1,
  gap: 1,
  'resize-corner': 2,
  'resize-edge': 3,
  rotate: 4,
}

export type HandleId = string

export function resizeCornerId(corner: HandleCorner): HandleId {
  return `resize-corner:${corner}`
}
export function resizeEdgeId(side: HandleSide): HandleId {
  return `resize-edge:${side}`
}
export function rotateId(corner: HandleCorner): HandleId {
  return `rotate:${corner}`
}
export function radiusId(corner: HandleCorner): HandleId {
  return `radius:${corner}`
}
export function paddingId(side: HandleSide): HandleId {
  return `padding:${side}`
}
export function marginId(side: HandleSide): HandleId {
  return `margin:${side}`
}
export function gapId(index: number): HandleId {
  return `gap:${index}`
}

type LocalPoint = { x: number; y: number }

/** Axis-aligned hit rect in *element-local* coordinates (pre-rotation). */
type LocalRect = { left: number; top: number; width: number; height: number }

export interface HandleCandidate {
  id: HandleId
  kind: HandleKind
  /** Local hit region (unrotated element box). */
  hit: LocalRect
}

export interface SideSpacing {
  top: number
  right: number
  bottom: number
  left: number
}

export interface GapCandidateInput {
  /** Midpoint of the gap in element-local coords. */
  x: number
  y: number
  /** Gap axis is vertical (row-gap / column flex) → horizontal bar. */
  column: boolean
}

export interface BuildCandidatesInput {
  rect: Pick<Rect, 'width' | 'height' | 'rotation'>
  layout: HandleLayout
  /** CSS px radii per corner; scaled to screen by `scale`. */
  radii?: Partial<Record<HandleCorner, number>>
  padding?: SideSpacing
  margin?: SideSpacing
  gaps?: GapCandidateInput[]
  /** Include radius / padding / margin / gap candidates (hover-revealed). */
  chromeRevealed?: boolean
  /** Viewport scale: CSS px → screen px for spacing/radius offsets. */
  scale?: number
}

const ALL_CORNERS: readonly HandleCorner[] = ['tl', 'tr', 'br', 'bl']

function cornerLocal(corner: HandleCorner, W: number, H: number): LocalPoint {
  return {
    x: corner === 'tl' || corner === 'bl' ? 0 : W,
    y: corner === 'tl' || corner === 'tr' ? 0 : H,
  }
}

function squareAround(p: LocalPoint, size: number): LocalRect {
  return {
    left: p.x - size / 2,
    top: p.y - size / 2,
    width: size,
    height: size,
  }
}

function edgeBandLocal(side: HandleSide, W: number, H: number, thickness: number): LocalRect {
  switch (side) {
    case 'top':
      return { left: 0, top: 0, width: W, height: thickness }
    case 'bottom':
      return { left: 0, top: H - thickness, width: W, height: thickness }
    case 'left':
      return { left: 0, top: 0, width: thickness, height: H }
    case 'right':
      return { left: W - thickness, top: 0, width: thickness, height: H }
  }
}

function spacingOffset(cssPx: number, scale: number): number {
  return Math.max(cssPx * scale, SPACING_MIN_OFFSET)
}

function paddingPoint(
  side: HandleSide,
  W: number,
  H: number,
  pad: SideSpacing,
  scale: number,
): LocalPoint {
  const off = (v: number) => spacingOffset(v, scale)
  switch (side) {
    case 'top':
      return { x: W / 2, y: off(pad.top) }
    case 'bottom':
      return { x: W / 2, y: H - off(pad.bottom) }
    case 'left':
      return { x: off(pad.left), y: H / 2 }
    case 'right':
      return { x: W - off(pad.right), y: H / 2 }
  }
}

function marginPoint(
  side: HandleSide,
  W: number,
  H: number,
  mar: SideSpacing,
  scale: number,
): LocalPoint {
  const off = (v: number) => spacingOffset(v, scale)
  switch (side) {
    case 'top':
      return { x: W / 2, y: -off(mar.top) }
    case 'bottom':
      return { x: W / 2, y: H + off(mar.bottom) }
    case 'left':
      return { x: -off(mar.left), y: H / 2 }
    case 'right':
      return { x: W + off(mar.right), y: H / 2 }
  }
}

/** Asymmetric hit rect matching SpacingHandles.hitAreaRect (axis-aligned only). */
function spacingHitRect(
  kind: 'padding' | 'margin',
  side: HandleSide,
  point: LocalPoint,
): LocalRect {
  const len = SPACING_BAR_LENGTH
  const horizontal = side === 'top' || side === 'bottom'
  if (horizontal) {
    const inward = side === 'top' ? +1 : -1
    const dir = kind === 'padding' ? inward : -inward
    const halfBar = SPACING_BAR / 2
    return {
      left: point.x - len / 2 - SPACING_HIT_ALONG,
      top: dir > 0 ? point.y - halfBar : point.y - halfBar - SPACING_HIT_OFFSET,
      width: len + SPACING_HIT_ALONG * 2,
      height: SPACING_BAR + SPACING_HIT_OFFSET,
    }
  }
  const inward = side === 'left' ? +1 : -1
  const dir = kind === 'padding' ? inward : -inward
  const halfBar = SPACING_BAR / 2
  return {
    left: dir > 0 ? point.x - halfBar : point.x - halfBar - SPACING_HIT_OFFSET,
    top: point.y - len / 2 - SPACING_HIT_ALONG,
    width: SPACING_BAR + SPACING_HIT_OFFSET,
    height: len + SPACING_HIT_ALONG * 2,
  }
}

function gapHitRect(x: number, y: number, column: boolean): LocalRect {
  const len = SPACING_BAR_LENGTH
  if (column) {
    return {
      left: x - len / 2 - SPACING_HIT_ALONG,
      top: y - SPACING_BAR / 2 - SPACING_HIT_OFFSET,
      width: len + SPACING_HIT_ALONG * 2,
      height: SPACING_BAR + SPACING_HIT_OFFSET * 2,
    }
  }
  return {
    left: x - SPACING_BAR / 2 - SPACING_HIT_OFFSET,
    top: y - len / 2 - SPACING_HIT_ALONG,
    width: SPACING_BAR + SPACING_HIT_OFFSET * 2,
    height: len + SPACING_HIT_ALONG * 2,
  }
}

function radiusLocal(
  corner: HandleCorner,
  W: number,
  H: number,
  radiusCssPx: number,
  scale: number,
): LocalPoint {
  const maxR = Math.min(W, H) / 2 / scale
  const r = Math.min(radiusCssPx, maxR)
  const inset = r * scale + RADIUS_CORNER_INSET
  return {
    x: corner === 'tl' || corner === 'bl' ? inset : W - inset,
    y: corner === 'tl' || corner === 'tr' ? inset : H - inset,
  }
}

/**
 * Build every handle candidate that may be interactive for this selection.
 * Spacing / radius are omitted when the box is rotated (same as the overlays)
 * or when `chromeRevealed` is false.
 */
export function buildHandleCandidates(input: BuildCandidatesInput): HandleCandidate[] {
  const { rect, layout } = input
  const W = rect.width
  const H = rect.height
  const scale = input.scale ?? 1
  const rotated = Math.round(rect.rotation) !== 0
  const out: HandleCandidate[] = []

  for (const corner of ALL_CORNERS) {
    const p = cornerLocal(corner, W, H)
    out.push({
      id: rotateId(corner),
      kind: 'rotate',
      hit: squareAround(p, ROTATE_HIT_SIZE),
    })
  }

  for (const corner of layout.corners) {
    const p = cornerLocal(corner, W, H)
    out.push({
      id: resizeCornerId(corner),
      kind: 'resize-corner',
      hit: squareAround(p, CORNER_SIZE),
    })
  }

  for (const side of layout.edges) {
    out.push({
      id: resizeEdgeId(side),
      kind: 'resize-edge',
      hit: edgeBandLocal(side, W, H, EDGE_GRAB_THICKNESS),
    })
  }

  if (!rotated && input.chromeRevealed) {
    const radii = input.radii ?? {}
    for (const corner of ALL_CORNERS) {
      const p = radiusLocal(corner, W, H, radii[corner] ?? 0, scale)
      const size = RADIUS_DOT_SIZE + RADIUS_HIT_PAD * 2
      out.push({
        id: radiusId(corner),
        kind: 'radius',
        hit: squareAround(p, size),
      })
    }

    const pad = input.padding ?? { top: 0, right: 0, bottom: 0, left: 0 }
    const mar = input.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
    const sides: HandleSide[] = ['top', 'right', 'bottom', 'left']
    for (const side of sides) {
      const pp = paddingPoint(side, W, H, pad, scale)
      out.push({
        id: paddingId(side),
        kind: 'padding',
        hit: spacingHitRect('padding', side, pp),
      })
      const mp = marginPoint(side, W, H, mar, scale)
      out.push({
        id: marginId(side),
        kind: 'margin',
        hit: spacingHitRect('margin', side, mp),
      })
    }

    for (let i = 0; i < (input.gaps?.length ?? 0); i++) {
      const g = input.gaps![i]
      out.push({
        id: gapId(i),
        kind: 'gap',
        hit: gapHitRect(g.x, g.y, g.column),
      })
    }
  }

  return out
}

/** Rotate a local point into screen space about the element centre. */
export function localToScreen(
  local: LocalPoint,
  rect: Pick<Rect, 'top' | 'left' | 'width' | 'height' | 'rotation'>,
): { x: number; y: number } {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const rad = (rect.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = local.x - rect.width / 2
  const dy = local.y - rect.height / 2
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }
}

/** Distance from a screen point to an axis-aligned local hit rect after rotation. */
export function distanceToLocalRect(
  pointer: { x: number; y: number },
  hit: LocalRect,
  rect: Pick<Rect, 'top' | 'left' | 'width' | 'height' | 'rotation'>,
): number {
  // Inverse-rotate pointer into local space, then distance to AABB.
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const rad = (-rect.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = pointer.x - cx
  const dy = pointer.y - cy
  const lx = rect.width / 2 + dx * cos - dy * sin
  const ly = rect.height / 2 + dx * sin + dy * cos

  const nearestX = clamp(lx, hit.left, hit.left + hit.width)
  const nearestY = clamp(ly, hit.top, hit.top + hit.height)
  const ex = lx - nearestX
  const ey = ly - nearestY
  return Math.hypot(ex, ey)
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export interface PickClosestOptions {
  /** Current winner — kept until another is clearly closer (hysteresis). */
  currentId?: HandleId | null
  hysteresisPx?: number
  maxGrabPx?: number
}

/**
 * Pick the closest candidate to `pointer` (screen coords). Returns null when
 * nothing is within `maxGrabPx`.
 */
export function pickClosestHandle(
  candidates: HandleCandidate[],
  pointer: { x: number; y: number },
  rect: Pick<Rect, 'top' | 'left' | 'width' | 'height' | 'rotation'>,
  opts: PickClosestOptions = {},
): HandleId | null {
  const hysteresis = opts.hysteresisPx ?? PROXIMITY_HYSTERESIS_PX
  const maxGrab = opts.maxGrabPx ?? PROXIMITY_MAX_GRAB_PX
  if (candidates.length === 0) return null

  type Scored = { c: HandleCandidate; primary: number; secondary: number }
  const scored: Scored[] = []
  for (const c of candidates) {
    const primary = distanceToLocalRect(pointer, c.hit, rect)
    if (primary > maxGrab) continue
    const cx = c.hit.left + c.hit.width / 2
    const cy = c.hit.top + c.hit.height / 2
    const secondary = distanceToLocalRect(
      pointer,
      { left: cx, top: cy, width: 0, height: 0 },
      rect,
    )
    scored.push({ c, primary, secondary })
  }
  if (scored.length === 0) return null

  scored.sort((a, b) => {
    if (Math.abs(a.primary - b.primary) > 1e-6) return a.primary - b.primary
    if (Math.abs(a.secondary - b.secondary) > 1e-6) return a.secondary - b.secondary
    return PRIORITY[a.c.kind] - PRIORITY[b.c.kind]
  })
  const best = scored[0]

  const currentId = opts.currentId ?? null
  if (currentId && currentId !== best.c.id) {
    const current = scored.find(s => s.c.id === currentId)
    if (current && best.primary + hysteresis >= current.primary) {
      return currentId
    }
  }
  return best.c.id
}

export function readSideSpacing(
  cs: CSSStyleDeclaration,
  kind: 'padding' | 'margin',
): SideSpacing {
  const px = (v: string) => parseFloat(v) || 0
  if (kind === 'padding') {
    return {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    }
  }
  return {
    top: px(cs.marginTop),
    right: px(cs.marginRight),
    bottom: px(cs.marginBottom),
    left: px(cs.marginLeft),
  }
}

/** Gap midpoints for flex containers (mirrors GapHandles geometry). */
export function readGapCandidates(
  element: HTMLElement,
  rect: Pick<Rect, 'left' | 'top' | 'width' | 'height'>,
  cs: CSSStyleDeclaration,
): GapCandidateInput[] {
  if (!cs.display.includes('flex')) return []
  const column = cs.flexDirection.startsWith('column')
  const children = Array.from(element.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && getComputedStyle(c).display !== 'none',
  )
  if (children.length < 2) return []
  const out: GapCandidateInput[] = []
  for (let i = 0; i < children.length - 1; i++) {
    const a = children[i].getBoundingClientRect()
    const b = children[i + 1].getBoundingClientRect()
    out.push({
      x: column ? rect.width / 2 : (a.right + b.left) / 2 - rect.left,
      y: column ? (a.bottom + b.top) / 2 - rect.top : rect.height / 2,
      column,
    })
  }
  return out
}

export function readCornerRadii(element: Element): Record<HandleCorner, number> {
  const px = (prop: string) => parseFloat(getComputedStyle(element).getPropertyValue(prop)) || 0
  return {
    tl: px('border-top-left-radius'),
    tr: px('border-top-right-radius'),
    br: px('border-bottom-right-radius'),
    bl: px('border-bottom-left-radius'),
  }
}
