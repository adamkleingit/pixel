import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { COLORS, SIZES, Z_INDEX } from './tokens'

export interface DropdownOption {
  value: string
  label?: string
  icon?: ReactNode
}

export interface DropdownProps {
  value?: string
  onChange?: ((value: string) => void) | null
  options?: DropdownOption[]
  placeholder?: string
  renderTrigger?: ((current: DropdownOption | null) => ReactNode) | null
  width?: number | string
  disabled?: boolean
}

export function Dropdown({
  value = '',
  onChange = null,
  options = [],
  placeholder = '',
  renderTrigger = null,
  width = '100%',
  disabled = false,
}: DropdownProps = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const current = options.find(o => o.value === value) ?? null

  useLayoutEffect(() => {
    if (!isOpen) return
    const margin = 8
    function update() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const menuWidth = Math.max(rect.width, menuRef.current?.offsetWidth ?? rect.width)
      const menuHeight = menuRef.current?.offsetHeight ?? 0

      let left = rect.left
      let top = rect.bottom + 4
      if (menuHeight > 0 && top + menuHeight > vh - margin) {
        top = rect.top - menuHeight - 4
        if (top < margin) top = margin
      }
      if (left + menuWidth > vw - margin) left = vw - menuWidth - margin
      if (left < margin) left = margin
      setPos({ left, top, width: rect.width })
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
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handle(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setIsOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('mousedown', handle)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handle)
      window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const menu =
    isOpen && pos
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              minWidth: pos.width,
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              padding: 4,
              zIndex: Z_INDEX.popover,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {options.map(opt => {
              const active = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange?.(opt.value)
                    setIsOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    border: 'none',
                    background: active ? COLORS.inputActive : 'transparent',
                    color: COLORS.text,
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 4,
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.icon && <span style={{ display: 'inline-flex' }}>{opt.icon}</span>}
                  <span>{opt.label ?? opt.value}</span>
                </button>
              )
            })}
          </div>,
          document.body
        )
      : null

  return (
    <div style={{ position: 'relative', width, minWidth: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setIsOpen(v => !v) }}
        style={{
          width: '100%',
          height: SIZES.rowHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '0 8px',
          background: COLORS.input,
          border: 'none',
          borderRadius: 4,
          color: COLORS.text,
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            textAlign: 'left',
          }}
        >
          {renderTrigger
            ? renderTrigger(current)
            : current
              ? (current.label ?? current.value)
              : placeholder || '—'}
        </span>
        <span style={{ color: COLORS.muted, display: 'inline-flex' }}>
          <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
            <path d="M 2 4 L 5 7 L 8 4 Z" />
          </svg>
        </span>
      </button>
      {menu}
    </div>
  )
}
