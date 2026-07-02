/**
 * Button — text action button.
 *
 * Two variants:
 *   - 'primary'   — accent fill, white text. Use for the dominant CTA.
 *   - 'secondary' — subtle bg, primary text. Use for non-dominant actions.
 *
 * For icon-only buttons use <IconButton> instead.
 */

import { useState, type CSSProperties, type ReactNode } from 'react'
import { COLORS, FONT_SIZE, RADIUS } from '../theme'

export type ButtonVariant = 'primary' | 'secondary'
export type ButtonSize    = 'sm' | 'md'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  style?: CSSProperties
  children: ReactNode
}

const PAD: Record<ButtonSize, string> = {
  sm: '4px 10px',
  md: '6px 14px',
}

const FS: Record<ButtonSize, number> = {
  sm: FONT_SIZE.sm,
  md: FONT_SIZE.base,
}

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  style,
  children,
}: ButtonProps) {
  const [hovered, setHovered] = useState(false)

  const isPrimary = variant === 'primary'
  const bg = disabled
    ? COLORS.bgElevated
    : isPrimary
    ? hovered
      ? COLORS.accentHover
      : COLORS.accent
    : hovered
    ? COLORS.bgElevated
    : 'transparent'

  const color = disabled
    ? COLORS.textMuted
    : isPrimary
    ? '#ffffff'
    : COLORS.textPrimary

  const border = isPrimary ? 'none' : `1px solid ${COLORS.border}`

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bg,
        color,
        border,
        borderRadius: RADIUS.md,
        padding: PAD[size],
        fontSize: FS[size],
        fontWeight: isPrimary ? 600 : 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'background 0.1s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
