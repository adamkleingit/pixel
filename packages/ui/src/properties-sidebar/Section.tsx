import type { ReactNode } from 'react'
import { COLORS, SIZES } from './tokens'

export interface SectionProps {
  title?: string
  actions?: ReactNode
  children?: ReactNode
}

export function Section({
  title = '',
  actions = null,
  children = null,
}: SectionProps = {}) {
  return (
    <div
      style={{
        padding: `${SIZES.sectionPadY}px ${SIZES.sectionPadX}px`,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.text,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </div>
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
