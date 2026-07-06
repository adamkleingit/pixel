import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { COLORS } from './tokens'

export interface SliderProps {
  value?: number
  onChange?: ((value: number) => void) | null
  min?: number
  max?: number
  trackBackground?: string
  height?: number
  thumbSize?: number
  trackStyle?: CSSProperties
}

export function Slider({
  value = 0,
  onChange = null,
  min = 0,
  max = 1,
  trackBackground = COLORS.input,
  height = 12,
  thumbSize = 14,
  trackStyle = {},
}: SliderProps = {}) {
  const range = max - min || 1
  const pct = ((value - min) / range) * 100

  function setFromEvent(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange?.(min + ratio * range)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromEvent(e)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!(e.buttons & 1)) return
    setFromEvent(e)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      style={{
        position: 'relative',
        width: '100%',
        height: Math.max(height, thumbSize),
        display: 'flex',
        alignItems: 'center',
        touchAction: 'none',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: '100%',
          height,
          background: trackBackground,
          borderRadius: height / 2,
          ...trackStyle,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `calc(${pct}% - ${thumbSize / 2}px)`,
          width: thumbSize,
          height: thumbSize,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          border: `1px solid ${COLORS.border}`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
