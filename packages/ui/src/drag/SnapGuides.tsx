/**
 * Snap-guide overlay — draws the Figma-style alignment lines published by
 * `alignment-snap` while an element is moved or resized. Reads `getActiveGuides()`
 * on every `pixel-drag-frame` (same pattern as `InsertionLine`) and paints a
 * 1px rule per active alignment in viewport space.
 */

import { useEffect, useState } from 'react'
import { getActiveGuides, type AlignGuide } from './alignment-snap'

// Figma's smart-guide red — reads as "alignment," distinct from the purple
// selection/insertion chrome.
const GUIDE_COLOR = '#f24822'
const THICKNESS = 1

export function SnapGuides() {
  const [guides, setGuides] = useState<AlignGuide[]>([])

  useEffect(() => {
    function update() {
      setGuides(getActiveGuides())
    }
    update()
    document.addEventListener('pixel-drag-frame', update)
    return () => document.removeEventListener('pixel-drag-frame', update)
  }, [])

  if (guides.length === 0) return null

  return (
    <>
      {guides.map((g, i) => {
        const style: React.CSSProperties =
          g.axis === 'x'
            ? {
                left: g.position - THICKNESS / 2,
                top: g.start,
                width: THICKNESS,
                height: g.end - g.start,
              }
            : {
                left: g.start,
                top: g.position - THICKNESS / 2,
                width: g.end - g.start,
                height: THICKNESS,
              }
        return (
          <div
            key={i}
            data-pixel-snap-guide={g.axis}
            style={{
              position: 'fixed',
              background: GUIDE_COLOR,
              pointerEvents: 'none',
              zIndex: 1003,
              ...style,
            }}
          />
        )
      })}
    </>
  )
}
