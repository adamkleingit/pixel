import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import { OWN_UI_PROPS } from '../own-ui'
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
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isOpen, anchorRef, placement, offset, width])

  useEffect(() => {
    if (!isOpen) return
    function handle(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose?.()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('mousedown', handle)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handle)
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose, anchorRef])

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
      <div>{children}</div>
    </div>
  )

  return createPortal(node, document.body)
}
