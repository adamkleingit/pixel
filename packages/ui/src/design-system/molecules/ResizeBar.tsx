/**
 * ResizeBar — 4px draggable strip between two panes.
 *
 * Pure presentational hover/drag affordance. Owners wire up pointer handlers
 * and width math; this component just renders the strip. See ResizeHandle.tsx
 * (in canvas/) for the wired-up version Pixel uses today.
 */

import { useState, type CSSProperties } from 'react'
import { COLORS } from '../theme'

export interface ResizeBarProps {
  axis?: 'x' | 'y'
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void
  /** Force the active (accent) tint, e.g. while a parent-managed drag is live. */
  active?: boolean
  style?: CSSProperties
}

export function ResizeBar({
  axis = 'x',
  onPointerDown,
  onPointerMove,
  onPointerUp,
  active = false,
  style,
}: ResizeBarProps = {}) {
  const [hovered, setHovered] = useState(false)
  const isX = axis === 'x'
  const lit = hovered || active
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        width: isX ? 4 : '100%',
        height: isX ? '100%' : 4,
        background: lit ? COLORS.accent : 'transparent',
        opacity: lit ? 0.5 : 1,
        cursor: isX ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        transition: 'background 0.12s, opacity 0.12s',
        zIndex: 10,
        ...style,
      }}
    />
  )
}
