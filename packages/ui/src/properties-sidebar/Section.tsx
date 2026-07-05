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
  // A stable, slugified hook so tests (and any future automation) can target a
  // specific section — e.g. `[data-section="background"]` — since several
  // sections reuse the same generic controls (PaintRow's "Edit paint" swatch).
  const sectionId = title ? title.toLowerCase().replace(/\s+/g, '-') : undefined
  return (
    <div
      data-section={sectionId}
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
