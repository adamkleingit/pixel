/**
 * TabStrip — horizontal row of <Tab>s.
 *
 * Pure layout: takes children (Tabs) and lays them out left-aligned with no
 * gap, scrollable overflow. The strip itself is just spacing; tabs handle
 * their own active state and underline.
 */

import type { ReactNode } from 'react'

export interface TabStripProps {
  children: ReactNode
}

export function TabStrip({ children }: TabStripProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        padding: '0 2px',
        gap: 0,
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {children}
    </div>
  )
}
