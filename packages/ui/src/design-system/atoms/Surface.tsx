/**
 * Surface — neutral panel container.
 *
 * Use for any chrome surface (sidebar pane, toolbar strip, popover body) so
 * background/border/elevation stay consistent. Pure presentational; no state.
 *
 * Variants:
 *   - 'panel'    — flat surface used for sidebars                       (default)
 *   - 'elevated' — slightly raised surface for hover targets, code blocks
 *   - 'sunken'   — recessed surface for inputs                          (rarely used)
 */

import type { CSSProperties, ReactNode } from 'react'
import { COLORS, RADIUS } from '../theme'

export type SurfaceVariant = 'panel' | 'elevated' | 'sunken'

export interface SurfaceProps {
  variant?: SurfaceVariant
  bordered?: boolean
  radius?: keyof typeof RADIUS | 0
  padding?: number | string
  style?: CSSProperties
  className?: string
  children?: ReactNode
}

const BG: Record<SurfaceVariant, string> = {
  panel:    COLORS.bgSurface,
  elevated: COLORS.bgElevated,
  sunken:   COLORS.bgElevated,
}

export function Surface({
  variant  = 'panel',
  bordered = false,
  radius   = 0,
  padding,
  style,
  className,
  children,
}: SurfaceProps) {
  return (
    <div
      className={className}
      style={{
        background: BG[variant],
        border: bordered ? `1px solid ${COLORS.border}` : undefined,
        borderRadius: radius === 0 ? undefined : RADIUS[radius],
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
