import { COLORS } from './tokens'

export interface ColorSwatchProps {
  color?: string
  background?: string
  onClick?: (() => void) | null
  size?: number
  title?: string
}

const CHECKERED =
  'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)'

export function ColorSwatch({
  color = '#000000',
  background = '',
  onClick = null,
  size = 18,
  title = '',
}: ColorSwatchProps = {}) {
  const fill = background || color
  return (
    <button
      type="button"
      title={title}
      onClick={onClick ?? undefined}
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: 3,
        border: `1px solid ${COLORS.border}`,
        backgroundImage: background ? undefined : CHECKERED,
        backgroundSize: '6px 6px',
        backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0',
        padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: fill,
        }}
      />
    </button>
  )
}
