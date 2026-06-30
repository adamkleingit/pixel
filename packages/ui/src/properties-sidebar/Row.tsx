import type { ReactNode } from 'react'
import { COLORS, SIZES } from './tokens'

export interface RowProps {
  label?: string
  children?: ReactNode
}

export function Row({
  label = '',
  children = null,
}: RowProps = {}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <div
          style={{
            fontSize: 11,
            color: COLORS.label,
            letterSpacing: '0.01em',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SIZES.rowGap,
        }}
      >
        {children}
      </div>
    </div>
  )
}
