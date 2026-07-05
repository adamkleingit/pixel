import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import { OWN_UI_ATTR, OWN_UI_PROPS } from '../own-ui'
import { COLORS, Z_INDEX } from './tokens'

export interface PopoverProps {
  isOpen?: boolean
  onClose?: (() => void) | null
  title?: string
  headerRight?: ReactNode
  children?: ReactNode
  width?: number
  anchorRef?: RefObject<HTMLElement | null> | null
  placement?: 'left' | 'right'
  offset?: number
}

export function Popover({
  isOpen = false,
  onClose = null,
  title = '',
  headerRight = null,
  children = null,
  width = 260,
  anchorRef = null,
  placement = 'left',
  offset = 8,
}: PopoverProps = {}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Keep the latest onClose / anchorRef in refs so the outside-close effect can
  // depend on `isOpen` alone. `onClose` and `anchorRef` are fresh identities on
  // every render, and this popover re-renders constantly in edit mode (each page
  // hover + each committed edit), so a deps-based subscription would churn the
  // window listener off/on every render — leaving it detached at the exact
  // moment of an outside click. Subscribe once per open instead.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const anchorRefRef = useRef(anchorRef)
  anchorRefRef.current = anchorRef

  useLayoutEffect(() => {
    if (!isOpen) return
    const anchor = anchorRef?.current
    if (!anchor) return
    const margin = 8
    function update() {
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const height = ref.current?.offsetHeight ?? 0

      let left =
        placement === 'left'
          ? rect.left - width - offset
          : rect.right + offset
      let top = rect.top

      if (left + width > vw - margin) left = vw - width - margin
      if (left < margin) left = margin
      if (height > 0) {
        if (top + height > vh - margin) top = vh - height - margin
        if (top < margin) top = margin
      }

      setPos({ left, top })
    }
    update()
    // Re-clamp when the popover's OWN content changes height (e.g. adding
    // gradient stops) — otherwise a grown popover overflows the viewport bottom
    // instead of shifting up, pushing controls off-screen.
    const ro = new ResizeObserver(update)
    // The node isn't mounted on this first run (pos is null → the popover
    // renders null, so `ref.current` is still null). Attach the observer on the
    // next frame, once `setPos` above has caused the node to render.
    const raf = requestAnimationFrame(() => {
      update()
      if (ref.current) ro.observe(ref.current)
    })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isOpen, anchorRef, placement, offset, width])

  useEffect(() => {
    if (!isOpen) return
    function handle(e: Event) {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (anchorRefRef.current?.current?.contains(target)) return
      // Menus we own (Dropdowns, nested pickers) portal to <body> outside our
      // ref but carry the own-UI marker — clicking one must not close us.
      if (target instanceof Element && target.closest(`[${OWN_UI_ATTR}]`)) return
      onCloseRef.current?.()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current?.()
    }
    // Close on `pointerdown` in the CAPTURE phase. In edit mode the app-inert
    // layer swallows page `mousedown` (preventDefault + stopPropagation) at
    // window-capture, so a `mousedown` listener never sees an outside click.
    // `pointerdown` is deliberately left live by both that layer and the
    // selection handler (which only preventDefaults it), so a window-capture
    // listener here reliably sees clicks on the page, the pane, or anywhere else.
    window.addEventListener('pointerdown', handle, true)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointerdown', handle, true)
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  if (!isOpen || !pos) return null

  const node = (
    <div
      ref={ref}
      {...OWN_UI_PROPS}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width,
        // Never exceed the viewport: the body scrolls, and the position math
        // above shifts the whole popover up so its bottom stays on-screen.
        maxHeight: 'calc(100vh - 16px)',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        zIndex: Z_INDEX.popover,
        color: COLORS.text,
        fontSize: 12,
      }}
    >
      {(title || headerRight || onClose) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 10px 10px 12px',
            borderBottom: `1px solid ${COLORS.border}`,
            minHeight: 36,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {headerRight}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close"
                style={{
                  width: 24,
                  height: 24,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  color: COLORS.muted,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <line x1="3" y1="3" x2="9" y2="9" />
                  <line x1="9" y1="3" x2="3" y2="9" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
      <div style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
    </div>
  )

  return createPortal(node, document.body)
}
