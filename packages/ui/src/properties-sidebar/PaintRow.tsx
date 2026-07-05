import type React from 'react'
import type { Token } from '../pixel-common'
import { ColorSwatch } from './ColorSwatch'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { TokenButton } from './TokenButton'
import { eyeIcon, eyeOffIcon, minusIcon, opacityIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { useScrubbable } from './useScrubbable'

export interface PaintRowProps {
  hex?: string
  /** Placeholder shown when `hex` is empty — used by multi-edit "Multiple". */
  hexPlaceholder?: string
  label?: string
  swatchColor?: string
  swatchBackground?: string
  alpha?: string
  alphaPlaceholder?: string
  isVisible?: boolean
  /** When true, the whole row is inert (multi-edit "Multiple" state). */
  disabled?: boolean
  /** Hide individual trailing controls — used by gradient/image rows, whose
   *  opacity/token/visibility aren't meaningful (the swatch opens a full editor
   *  popover instead). `onRemove` still renders when a handler is given. */
  hideAlpha?: boolean
  hideToken?: boolean
  hideVisibility?: boolean
  onHexChange?: ((hex: string) => void) | null
  onAlphaChange?: ((alpha: string) => void) | null
  onVisibilityChange?: ((isVisible: boolean) => void) | null
  onSwatchClick?: (() => void) | null
  onRemove?: (() => void) | null
  /** Drag-to-reorder (multi-layer backgrounds). When given, a grip handle is
   *  rendered at the row's leading edge; pressing it starts a drag the list
   *  owner tracks. `isDragging` dims the row while it's the one being moved. */
  onDragHandleDown?: ((e: React.PointerEvent) => void) | null
  isDragging?: boolean
  /** Token picker — render a per-row TokenButton between the alpha input and
   *  the visibility toggle. Omit to hide the button (e.g. when the parent
   *  hasn't wired a handler yet). */
  tokenProperty?: string | null
  onTokenSelect?: ((token: Token) => void) | null
}

export function PaintRow({
  hex = '000000',
  hexPlaceholder = '',
  label = '',
  swatchColor = '#000000',
  swatchBackground = '',
  alpha = '100',
  alphaPlaceholder = '',
  isVisible = true,
  disabled = false,
  hideAlpha = false,
  hideToken = false,
  hideVisibility = false,
  onHexChange = null,
  onAlphaChange = null,
  onVisibilityChange = null,
  onSwatchClick = null,
  onRemove = null,
  onDragHandleDown = null,
  isDragging = false,
  tokenProperty = null,
  onTokenSelect = null,
}: PaintRowProps = {}) {
  const scrubAlpha = useScrubbable({
    value: alpha,
    onChange: onAlphaChange,
    min: 0,
    max: 100,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.5 : isDragging ? 0.4 : 1 }}>
      {onDragHandleDown && (
        <button
          type="button"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          onPointerDown={disabled ? undefined : onDragHandleDown}
          style={{
            flexShrink: 0,
            width: 16,
            height: SIZES.rowHeight,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: COLORS.muted,
            cursor: disabled ? 'not-allowed' : 'grab',
            touchAction: 'none',
          }}
        >
          {gripIcon}
        </button>
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 6px',
          height: SIZES.rowHeight,
          background: COLORS.input,
          borderRadius: 4,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
      >
        <ColorSwatch
          color={swatchColor}
          background={swatchBackground}
          onClick={disabled ? null : onSwatchClick}
          size={18}
          title="Edit paint"
        />
        {label ? (
          <button
            type="button"
            onClick={onSwatchClick ?? undefined}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              color: COLORS.text,
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {label}
          </button>
        ) : (
          <input
            type="text"
            value={hex}
            placeholder={hexPlaceholder}
            disabled={disabled}
            onChange={e => onHexChange?.(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: COLORS.text,
              fontSize: 12,
              fontFamily: 'inherit',
              padding: 0,
              textTransform: hexPlaceholder ? 'none' : 'uppercase',
              cursor: disabled ? 'not-allowed' : 'text',
            }}
          />
        )}
      </div>
      {!hideAlpha && (
        <div style={{ width: 76, display: 'flex' }}>
          <NumericInput
            value={alpha}
            placeholder={alphaPlaceholder}
            disabled={disabled}
            onChange={onAlphaChange}
            prefix={opacityIcon}
            suffix={alphaPlaceholder ? '' : '%'}
            ariaLabel="Opacity"
            prefixProps={scrubAlpha.prefixProps}
          />
        </div>
      )}
      {!hideToken && tokenProperty && onTokenSelect && (
        <TokenButton property={tokenProperty} onSelect={onTokenSelect} disabled={disabled} />
      )}
      {!hideVisibility && (
        <IconButton
          title={isVisible ? 'Hide' : 'Show'}
          isActive={isVisible}
          isDisabled={disabled}
          onClick={() => { if (!disabled) onVisibilityChange?.(!isVisible) }}
        >
          {isVisible ? eyeIcon : eyeOffIcon}
        </IconButton>
      )}
      {onRemove && (
        <IconButton title="Remove" isDisabled={disabled} onClick={disabled ? null : onRemove}>
          {minusIcon}
        </IconButton>
      )}
    </div>
  )
}

const gripIcon = (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
    <circle cx="6" cy="4" r="1.15" />
    <circle cx="10" cy="4" r="1.15" />
    <circle cx="6" cy="8" r="1.15" />
    <circle cx="10" cy="8" r="1.15" />
    <circle cx="6" cy="12" r="1.15" />
    <circle cx="10" cy="12" r="1.15" />
  </svg>
)
