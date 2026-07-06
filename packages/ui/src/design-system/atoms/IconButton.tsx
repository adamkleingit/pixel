/**
 * IconButton — square chrome button that holds a single icon glyph.
 *
 * Used for toolbar tools, pane action buttons, inline minimize/close affordances.
 * Pure presentational; the parent owns state (`active`).
 *
 * Variants:
 *   - 'tool'  — 28×28, used by main toolbar tool selector
 *   - 'small' — 24×24, used by pane header actions (minimize, detach)
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { COLORS, RADIUS } from '../theme'

export type IconButtonSize = 'tool' | 'small'

export interface IconButtonProps {
  active?: boolean
  size?: IconButtonSize
  title?: string
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
  children: ReactNode
}

const DIM: Record<IconButtonSize, { box: number; radius: number }> = {
  tool:  { box: 28, radius: RADIUS.sm + 1 },
  small: { box: 24, radius: RADIUS.sm },
}

export function IconButton({
  active = false,
  size = 'tool',
  title,
  onClick,
  disabled = false,
  style,
  children,
}: IconButtonProps) {
  const [hovered, setHovered] = useState(false)
  const dim = DIM[size]

  const bg = disabled
    ? 'transparent'
    : active
    ? COLORS.bgActive
    : hovered
    ? COLORS.bgElevated
    : 'transparent'

  const color = disabled
    ? COLORS.textMuted
    : active
    ? COLORS.textPrimary
    : hovered
    ? COLORS.textSecondary
    : COLORS.textMuted

  return (
    <button
      type="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: dim.box,
        height: dim.box,
        borderRadius: dim.radius,
        background: bg,
        color,
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.1s, color 0.1s',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
