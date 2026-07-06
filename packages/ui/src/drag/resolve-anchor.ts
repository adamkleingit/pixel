/**
 * Resolve the layout *anchor* of an element — which sides are pinned by the
 * surrounding layout, and which sides are free to move when the box is
 * resized. The anchor drives where resize handles appear: handles only sit
 * on the sides that actually grow/shrink.
 *
 * See tech-specs/drag-to-resize.md §4.2.
 *
 * Pure: no React, no DOM mutation. Reads `getComputedStyle(el)` and the
 * parent's computed style, plus `readExplicit` for `margin: auto` detection
 * (browsers resolve `auto` margins to px in getComputedStyle, so we have to
 * inspect the specified value).
 */

import { readExplicit } from '../edit/read-explicit'

export type AnchorAxis = 'start' | 'end' | 'center' | 'stretch'

export interface Anchor {
  horizontal: AnchorAxis
  vertical: AnchorAxis
}

type Side = 'top' | 'right' | 'bottom' | 'left'

export function resolveAnchor(el: Element): Anchor {
  const cs = getComputedStyle(el)

  let horizontal: AnchorAxis | null = anchorFromMargin(el, 'left', 'right')
  let vertical: AnchorAxis | null = anchorFromMargin(el, 'top', 'bottom')

  const parent = el.parentElement
  if (parent && (horizontal === null || vertical === null)) {
    const pcs = getComputedStyle(parent)
    const fromParent = anchorFromParent(cs, pcs)
    if (horizontal === null) horizontal = fromParent.horizontal
    if (vertical === null) vertical = fromParent.vertical
  }

  if (horizontal === null) horizontal = 'start'
  if (vertical === null) vertical = 'start'

  if (cs.direction === 'rtl') horizontal = swap(horizontal)
  return { horizontal, vertical }
}

// `auto` on the *near* side pushes the element to the far end of the parent
// → the anchor is `end`. Symmetric for the far side. Both auto → centered.
// Reads the *specified* value via readExplicit because browsers resolve
// `auto` margins to px in getComputedStyle.
function anchorFromMargin(el: Element, near: Side, far: Side): AnchorAxis | null {
  const nearAuto = isMarginAuto(el, near)
  const farAuto = isMarginAuto(el, far)
  if (nearAuto && farAuto) return 'center'
  if (nearAuto) return 'end'
  if (farAuto) return 'start'
  return null
}

function isMarginAuto(el: Element, side: Side): boolean {
  return readExplicit(el, `margin-${side}`).value === 'auto'
}

function anchorFromParent(
  cs: CSSStyleDeclaration,
  pcs: CSSStyleDeclaration,
): { horizontal: AnchorAxis | null; vertical: AnchorAxis | null } {
  const display = pcs.display
  if (display === 'flex' || display === 'inline-flex') {
    return anchorFromFlexParent(cs, pcs)
  }
  if (display === 'grid' || display === 'inline-grid') {
    return anchorFromGridParent(cs, pcs)
  }
  // text-align on a block parent only affects inline children. We treat
  // inline-block as the only intentionally-resizable inline child.
  if (cs.display === 'inline-block') {
    return { horizontal: mapTextAlign(pcs.textAlign), vertical: null }
  }
  return { horizontal: null, vertical: null }
}

function anchorFromFlexParent(
  cs: CSSStyleDeclaration,
  pcs: CSSStyleDeclaration,
): { horizontal: AnchorAxis | null; vertical: AnchorAxis | null } {
  const dir = pcs.flexDirection || 'row'
  const isRow = dir === 'row' || dir === 'row-reverse'
  const reverse = dir === 'row-reverse' || dir === 'column-reverse'

  const justify = mapJustifyContent(pcs.justifyContent || 'flex-start')
  const alignRaw = cs.alignSelf && cs.alignSelf !== 'auto' ? cs.alignSelf : pcs.alignItems
  const align = mapAlignItems(alignRaw || 'stretch')

  const main = reverse ? swap(justify) : justify
  return isRow
    ? { horizontal: main, vertical: align }
    : { horizontal: align, vertical: main }
}

function anchorFromGridParent(
  cs: CSSStyleDeclaration,
  pcs: CSSStyleDeclaration,
): { horizontal: AnchorAxis | null; vertical: AnchorAxis | null } {
  const justify = cs.justifySelf && cs.justifySelf !== 'auto' ? cs.justifySelf : pcs.justifyItems
  const align = cs.alignSelf && cs.alignSelf !== 'auto' ? cs.alignSelf : pcs.alignItems
  return {
    horizontal: mapGridPlacement(justify || 'stretch'),
    vertical: mapGridPlacement(align || 'stretch'),
  }
}

// Single-item approximation: space-* distribution doesn't translate cleanly
// to an anchor, so we treat it as start.
function mapJustifyContent(v: string): AnchorAxis {
  switch (v) {
    case 'flex-start':
    case 'start':
    case 'left':
      return 'start'
    case 'flex-end':
    case 'end':
    case 'right':
      return 'end'
    case 'center':
      return 'center'
    case 'stretch':
      return 'stretch'
    default:
      return 'start'
  }
}

function mapAlignItems(v: string): AnchorAxis {
  switch (v) {
    case 'flex-start':
    case 'start':
    case 'self-start':
      return 'start'
    case 'flex-end':
    case 'end':
    case 'self-end':
      return 'end'
    case 'center':
      return 'center'
    case 'stretch':
    case 'normal':
      return 'stretch'
    case 'baseline':
    case 'first baseline':
    case 'last baseline':
      return 'start'
    default:
      return 'stretch'
  }
}

function mapGridPlacement(v: string): AnchorAxis {
  switch (v) {
    case 'start':
    case 'self-start':
    case 'flex-start':
      return 'start'
    case 'end':
    case 'self-end':
    case 'flex-end':
      return 'end'
    case 'center':
      return 'center'
    case 'stretch':
    case 'normal':
    case 'auto':
      return 'stretch'
    default:
      return 'stretch'
  }
}

function mapTextAlign(v: string): AnchorAxis | null {
  switch (v) {
    case 'left':
    case 'start':
      return 'start'
    case 'right':
    case 'end':
      return 'end'
    case 'center':
      return 'center'
    default:
      return null
  }
}

function swap(a: AnchorAxis): AnchorAxis {
  if (a === 'start') return 'end'
  if (a === 'end') return 'start'
  return a
}
