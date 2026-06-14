import type { StrokeShape } from '../context'

/** An SVG path `d` from client-coord points. */
function pathFrom(points: { x: number; y: number }[]): string {
  if (!points.length) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

/**
 * A freehand stroke rendered into a full-viewport SVG (no viewBox, so 1 user
 * unit = 1 client px). Used for both the live stroke and committed ones — they
 * look the same and stay visible until the Cmd key is released.
 */
export function DrawStroke({ stroke }: { stroke: StrokeShape }) {
  return (
    <svg className="screenshare-stroke">
      <path d={pathFrom(stroke.points)} />
    </svg>
  )
}
