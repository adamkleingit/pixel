import type React from 'react'
import { ColorSwatch } from './ColorSwatch'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Popover } from './Popover'
import { dropletIcon, opacityIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { useScrubbable } from './useScrubbable'
import type { BoxShadow } from '../edit/color'

export interface DropShadowPopoverProps {
  isOpen?: boolean
  onClose?: (() => void) | null
  anchorRef?: React.RefObject<HTMLElement | null> | null
  value?: BoxShadow
  onChange?: ((patch: Partial<BoxShadow>) => void) | null
}

const DEFAULT: BoxShadow = { x: '0', y: '4', blur: '4', spread: '0', hex: '000000', alphaPercent: '25' }

export function DropShadowPopover({
  isOpen = false,
  onClose = null,
  anchorRef = null,
  value = DEFAULT,
  onChange = null,
}: DropShadowPopoverProps = {}) {
  const { x, y, blur, spread, hex, alphaPercent: alpha } = value
  const emit = (patch: Partial<BoxShadow>) => onChange?.(patch)
  const setX = (v: string) => emit({ x: v })
  const setY = (v: string) => emit({ y: v })
  const setBlur = (v: string) => emit({ blur: v })
  const setSpread = (v: string) => emit({ spread: v })
  const setHex = (v: string) => emit({ hex: v })
  const setAlpha = (v: string) => emit({ alphaPercent: v })

  const scrubX = useScrubbable({ value: x, onChange: setX })
  const scrubY = useScrubbable({ value: y, onChange: setY })
  const scrubBlur = useScrubbable({ value: blur, onChange: setBlur, min: 0 })
  const scrubSpread = useScrubbable({ value: spread, onChange: setSpread })
  const scrubAlpha = useScrubbable({
    value: alpha,
    onChange: setAlpha,
    min: 0,
    max: 100,
  })

  const headerRight = <IconButton title="Blend mode">{dropletIcon}</IconButton>

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={260}
      title=""
      headerRight={headerRight}
    >
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.label, marginBottom: 4 }}>
            Offset
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <NumericInput
              prefix="X"
              value={x}
              onChange={setX}
              prefixProps={scrubX.prefixProps}
            />
            <NumericInput
              prefix="Y"
              value={y}
              onChange={setY}
              prefixProps={scrubY.prefixProps}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.label, marginBottom: 4 }}>
              Blur
            </div>
            <NumericInput
              value={blur}
              onChange={setBlur}
              prefix={blurIcon}
              prefixProps={scrubBlur.prefixProps}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: COLORS.label, marginBottom: 4 }}>
              Spread
            </div>
            <NumericInput
              value={spread}
              onChange={setSpread}
              prefix={spreadIcon}
              prefixProps={scrubSpread.prefixProps}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: COLORS.label, marginBottom: 4 }}>
            Color
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 6px',
                background: COLORS.input,
                borderRadius: 4,
                height: SIZES.rowHeight,
              }}
            >
              <ColorSwatch color={`#${hex}`} background={`#${hex}`} size={18} />
              <input
                type="text"
                value={hex}
                onChange={e => setHex(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: COLORS.text,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                  padding: 0,
                }}
              />
            </div>
            <div style={{ width: 76, display: 'flex' }}>
              <NumericInput
                value={alpha}
                onChange={setAlpha}
                prefix={opacityIcon}
                suffix="%"
                prefixProps={scrubAlpha.prefixProps}
              />
            </div>
          </div>
        </div>
      </div>
    </Popover>
  )
}

const blurIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
    <circle cx="6" cy="6" r="3" strokeDasharray="1.2 1.4" />
    <circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const spreadIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
    <rect x="2" y="2" width="8" height="8" rx="1" strokeDasharray="1 1.2" />
    <rect x="4" y="4" width="4" height="4" rx="0.5" fill="currentColor" stroke="none" />
  </svg>
)
