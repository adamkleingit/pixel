import type { ReactNode } from 'react'
import { COLORS, SIZES } from './tokens'

export interface IconButtonProps {
  children?: ReactNode
  onClick?: (() => void) | null
  isActive?: boolean
  isDisabled?: boolean
  title?: string
}

export function IconButton({
  children = null,
  onClick = null,
  isActive = false,
  isDisabled = false,
  title = '',
}: IconButtonProps = {}) {
  return (
    <button
      type="button"
      title={title}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : (onClick ?? undefined)}
      style={{
        width: SIZES.iconButton,
        height: SIZES.iconButton,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isActive ? COLORS.inputActive : 'transparent',
        color: isActive ? COLORS.accentLight : COLORS.muted,
        border: 'none',
        borderRadius: 4,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
