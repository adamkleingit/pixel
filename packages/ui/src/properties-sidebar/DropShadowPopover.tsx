import { useEffect, useState } from 'react'
import type React from 'react'
import { ColorSwatch } from './ColorSwatch'
import { NumericInput } from './NumericInput'
import { Popover } from './Popover'
import { SaturationValuePicker } from './SaturationValuePicker'
import { Slider } from './Slider'
import { opacityIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { useScrubbable } from './useScrubbable'
import { hexToHsv, hsvToHex, normalizeHex, type BoxShadow } from '../edit/color'

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

  // Visual color picker for the shadow color, toggled by the swatch. HSV is held
  // locally and re-seeded whenever the hex changes from outside, so the SV
  // square + hue slider stay in sync (interactions flow HSV → hex → emit).
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hsv, setHsv] = useState(() => hexToHsv(hex))
  useEffect(() => {
    if (normalizeHex(hsvToHex(hsv.h, hsv.s, hsv.v)) !== normalizeHex(hex)) {
      setHsv(hexToHsv(hex))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex])
  function emitHsv(next: { h: number; s: number; v: number }) {
    setHsv(next)
    emit({ hex: hsvToHex(next.h, next.s, next.v) })
  }

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      width={260}
      title="Drop shadow"
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
              ariaLabel="Shadow X"
              prefixProps={{ ...scrubX.prefixProps, 'aria-label': 'Scrub shadow X' }}
            />
            <NumericInput
              prefix="Y"
              value={y}
              onChange={setY}
              ariaLabel="Shadow Y"
              prefixProps={{ ...scrubY.prefixProps, 'aria-label': 'Scrub shadow Y' }}
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
              ariaLabel="Shadow blur"
              prefixProps={{ ...scrubBlur.prefixProps, 'aria-label': 'Scrub shadow blur' }}
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
              ariaLabel="Shadow spread"
              prefixProps={{ ...scrubSpread.prefixProps, 'aria-label': 'Scrub shadow spread' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: COLORS.label }}>
            Color
          </div>

          {/* Visual picker — revealed by clicking the swatch. Editing the SV
              square or hue slider flows back to hex, keeping the row + element
              in sync. */}
          {pickerOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SaturationValuePicker
                hue={hsv.h}
                saturation={hsv.s}
                value={hsv.v}
                onChange={sv => emitHsv({ ...hsv, s: sv.saturation, v: sv.value })}
                height={140}
              />
              <Slider
                value={hsv.h}
                onChange={h => emitHsv({ ...hsv, h })}
                min={0}
                max={360}
                height={10}
                trackStyle={{
                  background:
                    'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 6px',
                background: COLORS.input,
                borderRadius: 4,
                height: SIZES.rowHeight,
              }}
            >
              <ColorSwatch
                color={`#${hex}`}
                background={`#${hex}`}
                size={18}
                title="Pick a color"
                onClick={() => setPickerOpen(o => !o)}
              />
              <input
                type="text"
                value={hex}
                onChange={e => setHex(e.target.value)}
                aria-label="Shadow color hex"
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
            <div style={{ width: 92, display: 'flex', flexShrink: 0 }}>
              <NumericInput
                value={alpha}
                onChange={setAlpha}
                prefix={opacityIcon}
                suffix="%"
                ariaLabel="Shadow opacity"
                prefixProps={{ ...scrubAlpha.prefixProps, 'aria-label': 'Scrub shadow opacity' }}
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
