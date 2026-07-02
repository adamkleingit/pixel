/**
 * Insertion-line overlay — rendered during a Cmd-mode reposition drag at the
 * candidate slot where the element would land if the user released right now.
 *
 * Reads `getInsertionLine()` each `pixel-drag-frame` event and paints a 2px
 * line in viewport space (portaled into <body> via the parent SelectionOverlays).
 *
 * Tech spec: tech-specs/drag-to-reposition.md §4.3.
 */

import { useEffect, useState } from 'react'
import { COLORS } from '../design-system'
import { getInsertionLine, type InsertionLineInfo } from './reposition-drag'

export function InsertionLine() {
  const [info, setInfo] = useState<InsertionLineInfo | null>(null)

  useEffect(() => {
    function update() { setInfo(getInsertionLine()) }
    update()
    document.addEventListener('pixel-drag-frame', update)
    return () => document.removeEventListener('pixel-drag-frame', update)
  }, [])

  if (!info) return null

  const THICKNESS = 2
  const isVertical = info.axis === 'x'

  const style: React.CSSProperties = isVertical
    ? {
        position: 'fixed',
        left: info.position - THICKNESS / 2,
        top: info.start,
        width: THICKNESS,
        height: info.end - info.start,
        background: COLORS.select,
        pointerEvents: 'none',
        zIndex: 1002,
        boxShadow: `0 0 0 1px ${COLORS.select}33`,
      }
    : {
        position: 'fixed',
        left: info.start,
        top: info.position - THICKNESS / 2,
        width: info.end - info.start,
        height: THICKNESS,
        background: COLORS.select,
        pointerEvents: 'none',
        zIndex: 1002,
        boxShadow: `0 0 0 1px ${COLORS.select}33`,
      }

  return <div style={style} data-pixel-insertion-line="" />
}
