import { useEffect } from 'react'

export interface BlipData {
  id: number
  x: number
  y: number
}

export interface BlipProps {
  /** Blip position + identity. */
  data: BlipData
  /** Called when the blip's animation has run its course and it can be removed. */
  onDone: (id: number) => void
  /** Lifetime in ms before removal. Default 1100 (matches the CSS animation). */
  lifetimeMs?: number
}

/** A purple glowing "radar blip" rendered at a click point; fades and self-removes. */
export function Blip({ data, onDone, lifetimeMs = 1100 }: BlipProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(data.id), lifetimeMs)
    return () => window.clearTimeout(timer)
  }, [data.id, lifetimeMs, onDone])

  return (
    <div className="pixel-blip" style={{ left: data.x, top: data.y }}>
      <div className="pixel-blip-ring" />
      <div className="pixel-blip-ring delay" />
      <div className="pixel-blip-dot" />
    </div>
  )
}
