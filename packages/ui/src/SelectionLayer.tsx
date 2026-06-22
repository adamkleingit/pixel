import { useEffect, useState } from 'react'
import { useScreenshareContext } from './context'

/**
 * Edit-mode selection (Phase 0, step 3). While editing — and not recording — a
 * pointerdown on the app picks the element under the pointer and draws an
 * outline over it. The edit-inert layer swallows mouse/click events (so the app
 * never reacts) but deliberately leaves *pointer* events alone, which is exactly
 * what lets us read the real target here.
 *
 * Selection state is local to this component: it mounts only while editing
 * (Overlay gates it), so exiting edit mode clears the selection for free. A
 * later step lifts it to the provider once the design panel needs to read it.
 */
export function SelectionLayer() {
  const { state } = useScreenshareContext()
  const recording = state === 'recording'
  const [selected, setSelected] = useState<Element | null>(null)

  useEffect(() => {
    // While recording, clicks belong to the recording (it captures them), so
    // selection yields — matching the edit-inert layer's same gating.
    if (recording) return
    const onPointerDown = (e: PointerEvent) => {
      // Ignore Pixel's own UI (the floating bar etc.). composedPath() pierces
      // shadow roots, so this keeps working once the UI is isolated later.
      if (
        e.composedPath().some(
          (n) => n instanceof Element && n.classList?.contains('screenshare-overlay'),
        )
      ) {
        return
      }
      const t = e.target
      if (t instanceof Element) setSelected(t)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [recording])

  if (!selected) return null
  return <SelectionOutline el={selected} />
}

/** A fixed-position box tracking the selected element's viewport rect. */
function SelectionOutline({ el }: { el: Element }) {
  const [rect, setRect] = useState<DOMRect>(() => el.getBoundingClientRect())
  useEffect(() => {
    const update = () => setRect(el.getBoundingClientRect())
    update()
    // The page is inert in edit mode, but scroll/resize still move the box.
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [el])
  return (
    <div
      className="screenshare-select-outline"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    />
  )
}
