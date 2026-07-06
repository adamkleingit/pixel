import type { PointerEvent as ReactPointerEvent } from 'react'

export interface SaturationValuePickerProps {
  hue?: number
  saturation?: number
  value?: number
  onChange?: ((next: { saturation: number; value: number }) => void) | null
  height?: number
}

export function SaturationValuePicker({
  hue = 0,
  saturation = 1,
  value = 1,
  onChange = null,
  height = 160,
}: SaturationValuePickerProps = {}) {
  function setFromEvent(e: ReactPointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
    onChange?.({ saturation: s, value: v })
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
      aria-label="Color saturation and brightness"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: `
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))
        `,
        borderRadius: 4,
        cursor: 'crosshair',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `calc(${saturation * 100}% - 6px)`,
          top: `calc(${(1 - value) * 100}% - 6px)`,
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: '2px solid #fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
