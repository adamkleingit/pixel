/**
 * Divider — 1px line, horizontal or vertical.
 *
 * Use for separating tool groups inside a toolbar or sections inside a panel.
 * For pane/sidebar borders, prefer the wrapper's `border` directly.
 */

import { COLORS } from '../theme'

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  /** Length on the cross-axis (px or CSS length).  Defaults: 18 vertical, 100% horizontal. */
  length?: number | string
  /** Outer margin on the main axis. */
  margin?: number | string
  /** Use the subtle (lighter) divider color. */
  subtle?: boolean
}

export function Divider({
  orientation = 'horizontal',
  length,
  margin = 0,
  subtle = false,
}: DividerProps = {}) {
  const color = subtle ? COLORS.borderSubtle : COLORS.border
  if (orientation === 'vertical') {
    return (
      <div
        style={{
          width: 1,
          height: length ?? 18,
          background: color,
          margin: typeof margin === 'number' ? `0 ${margin}px` : `0 ${margin}`,
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      style={{
        height: 1,
        width: length ?? '100%',
        background: color,
        margin: typeof margin === 'number' ? `${margin}px 0` : `${margin} 0`,
      }}
    />
  )
}
