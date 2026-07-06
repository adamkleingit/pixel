/**
 * Tab — single pill in a horizontal tab strip.
 *
 * Visual is the Figma-style underline tab: 1.5px bottom border on active,
 * subtle hover/idle/active text color shifts. Pure presentational; the
 * parent owns `active` and the click handler.
 *
 * Compose with <TabStrip> for the row container.
 */

import { useState, type ReactNode } from 'react'
import { COLORS, FONT_SIZE } from '../theme'

export interface TabProps {
  active?: boolean
  onClick?: () => void
  /** Optional leading glyph (size 11 recommended). */
  icon?: ReactNode
  children: ReactNode
}

export function Tab({
  active = false,
  onClick,
  icon,
  children,
}: TabProps) {
  const [hovered, setHovered] = useState(false)
  const color = active
    ? COLORS.textPrimary
    : hovered
    ? COLORS.textSecondary
    : COLORS.textMuted

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: `1.5px solid ${active ? COLORS.textPrimary : 'transparent'}`,
        color,
        cursor: 'pointer',
        padding: '0 10px',
        fontSize: FONT_SIZE.sm,
        fontWeight: active ? 500 : 400,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
        transition: 'color 0.1s, border-color 0.1s',
        flexShrink: 0,
        letterSpacing: '0.02em',
        fontFamily: 'inherit',
      }}
    >
      {icon}
      {children}
    </button>
  )
}
