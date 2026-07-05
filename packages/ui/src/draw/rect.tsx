import { useEffect } from 'react'
import type { RectFlash, RectShape } from '../context'

/** The rectangle being actively dragged. */
export function DragRect({ rect }: { rect: RectShape }) {
  return (
    <div
      className="pixel-rect"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />
  )
}

/** A completed rectangle that fades out and self-removes. */
export function RectFlashView({
  flash,
  onDone,
  lifetimeMs = 900,
}: {
  flash: RectFlash
  onDone: (id: number) => void
  lifetimeMs?: number
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(flash.id), lifetimeMs)
    return () => window.clearTimeout(timer)
  }, [flash.id, lifetimeMs, onDone])

  return (
    <div
      className="pixel-rect-flash"
      style={{ left: flash.x, top: flash.y, width: flash.width, height: flash.height }}
    />
  )
}
