import { useEffect, useState } from 'react'
import type React from 'react'
import { ColorSwatch } from './ColorSwatch'
import { Dropdown } from './Dropdown'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Popover } from './Popover'
import { SaturationValuePicker } from './SaturationValuePicker'
import { Slider } from './Slider'
import { dropletIcon, minusIcon, opacityIcon, plusIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { useScrubbable } from './useScrubbable'
import { hexToHsv, hsvToHex, normalizeHex } from '../edit/color'

export interface FillPopoverProps {
  isOpen?: boolean
  onClose?: (() => void) | null
  anchorRef?: React.RefObject<HTMLElement | null> | null
  /** Controlled hex (6-char, no #). */
  hex?: string
  /** Controlled alpha as a 0..100 string. */
  alpha?: string
  /** Fires on any change to hex or alpha. */
  onChangeColor?: ((hex: string, alpha: string) => void) | null
}

type PaintKind = 'solid' | 'gradient' | 'image' | 'video' | 'pattern'
type Tab = 'custom' | 'libraries'

const RECENTS = ['#FFFFFF', '#050505', '#6B6B6B', '#F5F5F5']

export function FillPopover({
  isOpen = false,
  onClose = null,
  anchorRef = null,
  hex = '050505',
  alpha = '100',
  onChangeColor = null,
}: FillPopoverProps = {}) {
  const [tab, setTab] = useState<Tab>('custom')
  const [kind, setKind] = useState<PaintKind>('solid')
  const [format, setFormat] = useState('Hex')

  // HSV is derived from hex so the SV picker + hue slider stay in sync with
  // the controlled color. Whenever the hex prop changes from outside, we
  // re-derive HSV; interactions inside the picker flow the other way (HSV →
  // hex → onChangeColor → parent re-renders with new hex).
  const [hsv, setHsv] = useState(() => hexToHsv(hex))
  useEffect(() => {
    const external = hexToHsv(hex)
    const current = hsvToHex(hsv.h, hsv.s, hsv.v)
    if (normalizeHex(current) !== normalizeHex(hex)) {
      setHsv(external)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex])

  function emitFromHsv(next: { h: number; s: number; v: number }) {
    setHsv(next)
    onChangeColor?.(hsvToHex(next.h, next.s, next.v), alpha)
  }

  const scrubAlpha = useScrubbable({
    value: alpha,
    onChange: (v: string) => onChangeColor?.(hex, v),
    min: 0,
    max: 100,
  })

  const headerRight = (
    <>
      <IconButton title="Add to library">{plusIcon}</IconButton>
    </>
  )

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      width={260}
      anchorRef={anchorRef}
      headerRight={headerRight}
      title=""
    >
      <div style={{ padding: 10 }}>
        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            marginBottom: 10,
            background: COLORS.input,
            borderRadius: 4,
            padding: 2,
          }}
        >
          {(['custom', 'libraries'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                height: 24,
                background: tab === t ? COLORS.inputActive : 'transparent',
                color: tab === t ? COLORS.text : COLORS.muted,
                border: 'none',
                borderRadius: 3,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Paint kind selector */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            marginBottom: 10,
          }}
        >
          {PAINT_KINDS.map(k => (
            <IconButton
              key={k.value}
              title={k.title}
              isActive={kind === k.value}
              onClick={() => setKind(k.value as PaintKind)}
            >
              {k.icon}
            </IconButton>
          ))}
          <div style={{ flex: 1 }} />
          <IconButton title="Blend mode">{dropletIcon}</IconButton>
          <IconButton title="Noise">{noiseIcon}</IconButton>
        </div>

        {tab === 'custom' && kind === 'solid' && (
          <SolidBody
            hue={hsv.h}
            saturation={hsv.s}
            colorValue={hsv.v}
            hex={hex}
            alpha={alpha}
            format={format}
            scrubAlphaProps={scrubAlpha.prefixProps}
            onHueChange={h => emitFromHsv({ ...hsv, h })}
            onSVChange={({ s, v }) => emitFromHsv({ ...hsv, s, v })}
            onHexChange={v => onChangeColor?.(v, alpha)}
            onAlphaChange={v => onChangeColor?.(hex, v)}
            onFormatChange={setFormat}
          />
        )}

        {tab === 'custom' && kind === 'gradient' && <GradientBody />}
        {tab === 'custom' && kind === 'image' && <ImageBody />}
        {tab === 'custom' && (kind === 'video' || kind === 'pattern') && (
          <StubBody kind={kind} />
        )}

        {tab === 'libraries' && (
          <div
            style={{
              padding: 24,
              color: COLORS.muted,
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            No libraries connected.
          </div>
        )}
      </div>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Solid body — color picker, sliders, hex + alpha, format, recents
// ---------------------------------------------------------------------------

interface SolidBodyProps {
  hue: number
  saturation: number
  colorValue: number
  hex: string
  alpha: string
  format: string
  scrubAlphaProps: ReturnType<typeof useScrubbable>['prefixProps']
  onHueChange: (v: number) => void
  onSVChange: (sv: { s: number; v: number }) => void
  onHexChange: (hex: string) => void
  onAlphaChange: (alpha: string) => void
  onFormatChange: (format: string) => void
}

function SolidBody({
  hue,
  saturation,
  colorValue,
  hex,
  alpha,
  format,
  scrubAlphaProps,
  onHueChange,
  onSVChange,
  onHexChange,
  onAlphaChange,
  onFormatChange,
}: SolidBodyProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SaturationValuePicker
        hue={hue}
        saturation={saturation}
        value={colorValue}
        onChange={sv => onSVChange({ s: sv.saturation, v: sv.value })}
        height={160}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconButton title="Pick color">{eyedropperIcon}</IconButton>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Slider
            value={hue}
            onChange={onHueChange}
            min={0}
            max={360}
            height={10}
            trackStyle={{
              background:
                'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
          />
          <Slider
            value={Number(alpha) / 100}
            onChange={v => onAlphaChange(String(Math.round(v * 100)))}
            min={0}
            max={1}
            height={10}
            trackStyle={{
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0), #${hex}),
                linear-gradient(45deg, #333 25%, transparent 25%),
                linear-gradient(-45deg, #333 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #333 75%),
                linear-gradient(-45deg, transparent 75%, #333 75%)
              `,
              backgroundSize: '100% 100%, 6px 6px, 6px 6px, 6px 6px, 6px 6px',
              backgroundPosition: '0 0, 0 0, 0 3px, 3px -3px, -3px 0',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 68 }}>
          <Dropdown
            value={format}
            onChange={onFormatChange}
            options={['Hex', 'RGB', 'HSL', 'HSB', 'CSS'].map(v => ({ value: v }))}
          />
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            background: COLORS.input,
            borderRadius: 4,
            height: SIZES.rowHeight,
          }}
        >
          <input
            type="text"
            value={hex}
            onChange={e => onHexChange(e.target.value)}
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
            onChange={onAlphaChange}
            prefix={opacityIcon}
            suffix="%"
            ariaLabel="Alpha"
            prefixProps={scrubAlphaProps}
          />
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <Dropdown
          value="page"
          onChange={() => {}}
          options={[
            { value: 'page', label: 'On this page' },
            { value: 'file', label: 'In this file' },
            { value: 'all', label: 'All recent' },
          ]}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        {RECENTS.map((c, i) => (
          <ColorSwatch key={i} color={c} background={c} size={18} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gradient body — simple linear gradient with stops
// ---------------------------------------------------------------------------

function GradientBody() {
  const [type, setType] = useState('Linear')
  const [stops, setStops] = useState([
    { position: '0', hex: '050505', alpha: '100' },
    { position: '100', hex: '6B6B6B', alpha: '100' },
  ])
  const [activeStop, setActiveStop] = useState(0)

  const gradientCss = `linear-gradient(to right, ${stops
    .map(s => `#${s.hex} ${s.position}%`)
    .join(', ')})`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Dropdown
            value={type}
            onChange={setType}
            options={['Linear', 'Radial', 'Angular', 'Diamond'].map(v => ({
              value: v,
            }))}
          />
        </div>
        <IconButton title="Reverse stops">{reverseIcon}</IconButton>
        <IconButton title="Rotate 90°">{rotateGradIcon}</IconButton>
      </div>

      <div
        style={{
          position: 'relative',
          height: 24,
          background: gradientCss,
          borderRadius: 4,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {stops.map((s, i) => (
          <div
            key={i}
            onClick={() => setActiveStop(i)}
            style={{
              position: 'absolute',
              left: `calc(${s.position}% - 6px)`,
              top: -4,
              width: 12,
              height: 32,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: `6px solid ${activeStop === i ? COLORS.accentLight : '#fff'}`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: 2,
                width: 8,
                height: 24,
                background: `#${s.hex}`,
                border: `2px solid ${activeStop === i ? COLORS.accentLight : '#fff'}`,
                borderRadius: 2,
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 11, color: COLORS.label, fontWeight: 600 }}>Stops</div>
        <IconButton
          title="Add stop"
          onClick={() =>
            setStops(prev => [...prev, { position: '50', hex: 'CCCCCC', alpha: '100' }])
          }
        >
          {plusIcon}
        </IconButton>
      </div>

      {stops.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ width: 54, display: 'flex' }}>
            <NumericInput
              value={s.position}
              onChange={v =>
                setStops(prev =>
                  prev.map((x, j) => (j === i ? { ...x, position: v } : x))
                )
              }
              suffix="%"
            />
          </div>
          <ColorSwatch color={`#${s.hex}`} background={`#${s.hex}`} size={18} />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              background: COLORS.input,
              borderRadius: 4,
              height: SIZES.rowHeight,
            }}
          >
            <input
              type="text"
              value={s.hex}
              onChange={e =>
                setStops(prev =>
                  prev.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x))
                )
              }
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
          <div style={{ width: 48, display: 'flex' }}>
            <NumericInput value={s.alpha} suffix="%" />
          </div>
          <IconButton
            title="Remove stop"
            onClick={() => setStops(prev => prev.filter((_, j) => j !== i))}
          >
            {minusIcon}
          </IconButton>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Image body — drop zone + fit mode + opacity
// ---------------------------------------------------------------------------

function ImageBody() {
  const [fit, setFit] = useState('Fill')
  const [opacity, setOpacity] = useState('100')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          height: 120,
          background: COLORS.input,
          borderRadius: 6,
          border: `1px dashed ${COLORS.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.muted,
          fontSize: 12,
        }}
      >
        Click or drop an image
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1 }}>
          <Dropdown
            value={fit}
            onChange={setFit}
            options={['Fill', 'Fit', 'Crop', 'Tile'].map(v => ({ value: v }))}
          />
        </div>
        <div style={{ width: 70, display: 'flex' }}>
          <NumericInput value={opacity} onChange={setOpacity} suffix="%" />
        </div>
      </div>
    </div>
  )
}

function StubBody({ kind }: { kind: PaintKind }) {
  return (
    <div
      style={{
        padding: 24,
        color: COLORS.muted,
        fontSize: 12,
        textAlign: 'center',
        textTransform: 'capitalize',
      }}
    >
      {kind} paint — coming soon
    </div>
  )
}

// ---------------------------------------------------------------------------
// Paint-kind selector icons
// ---------------------------------------------------------------------------

const solidKindIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <rect x="2" y="2" width="12" height="12" rx="1" />
  </svg>
)
const gradientKindIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14">
    <defs>
      <linearGradient id="gk" x1="0" x2="1">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
        <stop offset="100%" stopColor="currentColor" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="12" height="12" rx="1" fill="url(#gk)" />
  </svg>
)
const patternKindIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <circle cx="4" cy="4" r="1" />
    <circle cx="8" cy="4" r="1" />
    <circle cx="12" cy="4" r="1" />
    <circle cx="4" cy="8" r="1" />
    <circle cx="8" cy="8" r="1" />
    <circle cx="12" cy="8" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="8" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
  </svg>
)
const imageKindIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
    <path d="M 2 11 L 6 7.5 L 10 11 L 14 8" />
  </svg>
)
const videoKindIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <path d="M 3 3 L 13 8 L 3 13 Z" />
  </svg>
)

const PAINT_KINDS = [
  { value: 'solid', icon: solidKindIcon, title: 'Solid' },
  { value: 'gradient', icon: gradientKindIcon, title: 'Gradient' },
  { value: 'pattern', icon: patternKindIcon, title: 'Pattern' },
  { value: 'image', icon: imageKindIcon, title: 'Image' },
  { value: 'video', icon: videoKindIcon, title: 'Video' },
]

const eyedropperIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 10.5 2.5 L 13.5 5.5" />
    <path d="M 9 4 L 3 10 L 3 13 L 6 13 L 12 7" />
  </svg>
)

const noiseIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <circle cx="3" cy="4" r="0.7" />
    <circle cx="7" cy="3" r="0.7" />
    <circle cx="11" cy="5" r="0.7" />
    <circle cx="5" cy="7" r="0.7" />
    <circle cx="9" cy="8" r="0.7" />
    <circle cx="13" cy="9" r="0.7" />
    <circle cx="4" cy="11" r="0.7" />
    <circle cx="8" cy="12" r="0.7" />
    <circle cx="12" cy="13" r="0.7" />
  </svg>
)

const reverseIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M 4 5 H 11 M 4 5 L 6 3 M 4 5 L 6 7" />
    <path d="M 12 11 H 5 M 12 11 L 10 9 M 12 11 L 10 13" />
  </svg>
)

const rotateGradIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M 3 8 A 5 5 0 1 1 5 12" />
    <polyline points="3 10 3 13 6 13" />
  </svg>
)
