import { useEffect } from 'react'
import type { StrokeFlash, StrokeShape } from '../context'

/** An SVG path `d` from client-coord points. */
function pathFrom(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

/**
 * Full-viewport SVG (no viewBox) so 1 user unit = 1 client px — stroke points are
 * drawn directly in client coordinates. Sized to the viewport via CSS.
 */
function StrokeSvg({ d, className }: { d: string; className: string }) {
  return (
    <svg className={className}>
      <path d={d} />
    </svg>
  )
}

/** The freehand stroke being actively drawn. */
export function DrawStroke({ stroke }: { stroke: StrokeShape }) {
  return <StrokeSvg className="screenshare-stroke" d={pathFrom(stroke.points)} />
}

/** A completed stroke that fades out and self-removes. */
export function StrokeFlashView({
  flash,
  onDone,
  lifetimeMs = 1100,
}: {
  flash: StrokeFlash
  onDone: (id: number) => void
  lifetimeMs?: number
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(flash.id), lifetimeMs)
    return () => window.clearTimeout(timer)
  }, [flash.id, lifetimeMs, onDone])

  return <StrokeSvg className="screenshare-stroke-flash" d={pathFrom(flash.points)} />
}
