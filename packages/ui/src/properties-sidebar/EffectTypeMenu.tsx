import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import { checkIcon } from './icons'
import { OWN_UI_PROPS } from '../own-ui'
import { COLORS, Z_INDEX } from './tokens'

export interface EffectTypeMenuProps {
  isOpen?: boolean
  value?: string
  onChange?: ((value: string) => void) | null
  onClose?: (() => void) | null
  anchorRef?: RefObject<HTMLElement | null> | null
}

const EFFECT_TYPES = [
  'Inner shadow',
  'Drop shadow',
  'Layer blur',
  'Background blur',
  'Noise',
  'Texture',
  'Glass',
]

export function EffectTypeMenu({
  isOpen = false,
  value = 'Drop shadow',
  onChange = null,
  onClose = null,
  anchorRef = null,
}: EffectTypeMenuProps = {}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const width = 200

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
      let left = rect.left - width - 8
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
  }, [isOpen, anchorRef, width])

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
        padding: 4,
        fontSize: 12,
      }}
    >
      {EFFECT_TYPES.map(t => {
        const active = t === value
        const enabled = t === 'Drop shadow'
        return (
          <button
            key={t}
            type="button"
            disabled={!enabled}
            onClick={() => {
              if (!enabled) return
              onChange?.(t)
              onClose?.()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 8px 6px 24px',
              background: active ? COLORS.accent : 'transparent',
              color: enabled ? (active ? '#fff' : COLORS.text) : COLORS.muted,
              border: 'none',
              borderRadius: 4,
              textAlign: 'left',
              fontSize: 12,
              cursor: enabled ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              position: 'relative',
              opacity: enabled ? 1 : 0.55,
            }}
          >
            {active && (
              <span
                style={{
                  position: 'absolute',
                  left: 8,
                  display: 'inline-flex',
                  color: '#fff',
                }}
              >
                {checkIcon}
              </span>
            )}
            {t}
          </button>
        )
      })}
    </div>
  )

  return createPortal(node, document.body)
}
