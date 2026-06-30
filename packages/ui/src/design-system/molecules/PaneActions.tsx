/**
 * PaneActions — small action group on the right side of a PaneHeader.
 *
 * Standard set is collapse + detach. Both are optional; pass `null` to hide
 * one. Use small IconButtons so they sit comfortably in the 41px header.
 */

import { IconButton } from '../atoms/IconButton'
import { Maximize2Icon, MinusIcon } from '../icons'

export interface PaneActionsProps {
  onMinimize?: (() => void) | null
  onDetach?: (() => void) | null
}

export function PaneActions({
  onMinimize = null,
  onDetach = null,
}: PaneActionsProps = {}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '0 8px' }}>
      {onMinimize && (
        <IconButton size="small" onClick={onMinimize} title="Collapse pane">
          <MinusIcon size={11} />
        </IconButton>
      )}
      {onDetach && (
        <IconButton size="small" onClick={onDetach} title="Detach pane">
          <Maximize2Icon size={11} />
        </IconButton>
      )}
    </div>
  )
}
