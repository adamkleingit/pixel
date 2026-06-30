import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { HTMLAttributes, ReactNode } from 'react'
import { COLORS, SIZES, Z_INDEX } from './tokens'

export interface NumericDropdownProps {
  value?: string
  onChange?: ((value: string) => void) | null
  options?: string[]
  prefix?: ReactNode
  suffix?: string
  placeholder?: string
  disabled?: boolean
  prefixProps?: HTMLAttributes<HTMLSpanElement>
  ariaLabel?: string
  /** Name of the design token the current value coincides with — replaces the
   *  unit suffix when set. Matches NumericInput's behavior. */
  tokenLabel?: string | null
}

/**
 * Numeric input with a chevron that opens a list of preset values.
 * User can type freely or pick a preset. Used for font size, etc.
 */
export function NumericDropdown({
  value = '',
  onChange = null,
  options = [],
  prefix = null,
  suffix = '',
  placeholder = '',
  disabled = false,
  prefixProps = {},
  ariaLabel = '',
  tokenLabel = null,
}: NumericDropdownProps = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLLabelElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!isOpen) return
    const margin = 8
    function update() {
      const el = wrapRef.current
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
      if (wrapRef.current?.contains(target)) return
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

  return (
    <>
      <label
        ref={wrapRef}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: SIZES.rowHeight,
          padding: '0 4px 0 8px',
          background: COLORS.input,
          borderRadius: 4,
          overflow: 'hidden',
          color: COLORS.text,
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {prefix && (
          <span
            {...prefixProps}
            style={{
              color: COLORS.muted,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 12,
              fontSize: 11,
              flexShrink: 0,
              ...(disabled ? { pointerEvents: 'none' as const, cursor: 'not-allowed' as const } : null),
              ...(prefixProps.style ?? {}),
            }}
          >
            {prefix}
          </span>
        )}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange?.(e.target.value)}
          aria-label={ariaLabel}
          disabled={disabled}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: COLORS.text,
            fontSize: 12,
            padding: 0,
            fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        {tokenLabel ? (
          <span
            style={{
              color: COLORS.accent,
              fontSize: 11,
              flexShrink: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              maxWidth: 80,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={`Bound to token: ${tokenLabel}`}
          >
            {tokenLabel}
          </span>
        ) : (
          suffix && (
            <span style={{ color: COLORS.muted, fontSize: 11, flexShrink: 0 }}>
              {suffix}
            </span>
          )
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={e => {
            e.preventDefault()
            if (!disabled) setIsOpen(v => !v)
          }}
          aria-label="Choose preset"
          style={{
            width: 18,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: COLORS.muted,
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 0,
            flexShrink: 0,
            borderRadius: 3,
          }}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
            <path d="M 2 4 L 5 7 L 8 4 Z" />
          </svg>
        </button>
      </label>
      {isOpen &&
        pos &&
        createPortal(
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
              const active = opt === value
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange?.(opt)
                    setIsOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                    border: 'none',
                    background: active ? COLORS.inputActive : 'transparent',
                    color: COLORS.text,
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 4,
                    fontFamily: 'inherit',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
