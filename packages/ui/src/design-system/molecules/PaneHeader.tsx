/**
 * PaneHeader — the 41px header bar at the top of every sidebar pane.
 *
 * Layout: TabStrip on the left, action buttons on the right (typically minimize
 * and detach, see PaneActions). Pure layout — the parent supplies children.
 */

import type { ReactNode } from 'react'
import { COLORS, SIZES } from '../theme'

export interface PaneHeaderProps {
  children: ReactNode
}

export function PaneHeader({ children }: PaneHeaderProps) {
  return (
    <div
      style={{
        height: SIZES.paneHeaderH,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${COLORS.borderSubtle}`,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  )
}
