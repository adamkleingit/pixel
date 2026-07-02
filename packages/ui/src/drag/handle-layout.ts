/**
 * Pure mapping from element layout properties → which resize handles to
 * render on the selection overlay. Handles are addressed as edges
 * (top/right/bottom/left) and corners (tl/tr/bl/br); the overlay component
 * decides their pixel placement off these labels.
 *
 * See tech-specs/drag-to-resize.md §4.
 */

import type { Anchor, AnchorAxis } from './resolve-anchor'

export type HandleSide = 'top' | 'right' | 'bottom' | 'left'
export type HandleCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface HandleLayout {
  edges: HandleSide[]
  corners: HandleCorner[]
}

export interface DisplayInputs {
  /** Computed `display` of the selected element. */
  display: string
  /** Computed `position` of the selected element. */
  position: string
}

export interface DimensionInputs {
  /** True when `width` is explicitly set inline or via a matched rule. */
  hasExplicitWidth: boolean
  /** True when `height` is explicitly set inline or via a matched rule. */
  hasExplicitHeight: boolean
}

const NO_HANDLES: HandleLayout = { edges: [], corners: [] }

export function computeResizeHandles(
  inputs: DisplayInputs,
  anchor: Anchor,
  dims: DimensionInputs,
): HandleLayout {
  // `width`/`height` are ignored on inline boxes; tables size cells outside
  // our control.
  if (inputs.display === 'inline') return NO_HANDLES
  if (inputs.display.startsWith('table')) return NO_HANDLES
  if (inputs.display === 'contents' || inputs.display === 'none') return NO_HANDLES

  // No explicit dimensions → element is content-sized; dragging would replace
  // `auto` with a px value, which is a destructive change the user didn't
  // ask for. Refuse handles on axes without an explicit dim.
  if (!dims.hasExplicitWidth && !dims.hasExplicitHeight) return NO_HANDLES

  // Out-of-flow elements aren't pinned by parent layout — treat as `center`
  // anchor on each axis (handles on both sides). The dimension filter still
  // narrows this down when only one of width/height is explicit.
  const baseAnchor: Anchor =
    inputs.position === 'absolute' || inputs.position === 'fixed'
      ? { horizontal: 'center', vertical: 'center' }
      : anchor

  const effective: Anchor = {
    horizontal: dims.hasExplicitWidth ? baseAnchor.horizontal : 'stretch',
    vertical: dims.hasExplicitHeight ? baseAnchor.vertical : 'stretch',
  }
  return placementFromAnchor(effective)
}

function placementFromAnchor(anchor: Anchor): HandleLayout {
  const horizontal = horizontalSides(anchor.horizontal)
  const vertical = verticalSides(anchor.vertical)

  const edges: HandleSide[] = [...vertical, ...horizontal]
  const corners: HandleCorner[] = []
  for (const v of vertical) {
    for (const h of horizontal) {
      corners.push(cornerFromSides(v, h))
    }
  }
  return { edges, corners }
}

function horizontalSides(axis: AnchorAxis): HandleSide[] {
  switch (axis) {
    case 'start': return ['right']
    case 'end': return ['left']
    case 'center': return ['left', 'right']
    case 'stretch': return []
  }
}

function verticalSides(axis: AnchorAxis): HandleSide[] {
  switch (axis) {
    case 'start': return ['bottom']
    case 'end': return ['top']
    case 'center': return ['top', 'bottom']
    case 'stretch': return []
  }
}

function cornerFromSides(v: HandleSide, h: HandleSide): HandleCorner {
  const top = v === 'top'
  const left = h === 'left'
  if (top && left) return 'tl'
  if (top && !left) return 'tr'
  if (!top && left) return 'bl'
  return 'br'
}
