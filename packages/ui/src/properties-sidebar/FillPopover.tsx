import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { ColorSwatch } from './ColorSwatch'
import { Dropdown } from './Dropdown'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Popover } from './Popover'
import { SaturationValuePicker } from './SaturationValuePicker'
import { Slider } from './Slider'
import { minusIcon, opacityIcon, plusIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { useScrubbable } from './useScrubbable'
import { useTokensOf } from '../tokens-context'
import type { Token } from '../pixel-common'
import { hexToHsv, hsvToHex, normalizeHex, rgbStringToHexAlpha } from '../edit/color'
import {
  defaultGradient,
  defaultImage,
  defaultSolid,
  newStopId,
  sortedStops,
  type BackgroundPaint,
  type GradientPaint,
  type GradientStop,
  type ImagePaint,
} from '../edit/background-paint'

export interface FillPopoverProps {
  isOpen?: boolean
  onClose?: (() => void) | null
  anchorRef?: React.RefObject<HTMLElement | null> | null
  // --- Solid-only mode (Stroke / Text color) --------------------------------
  /** Controlled hex (6-char, no #). */
  hex?: string
  /** Controlled alpha as a 0..100 string. */
  alpha?: string
  /** Fires on any change to hex or alpha. */
  onChangeColor?: ((hex: string, alpha: string) => void) | null
  // --- Full-paint mode (Background) -----------------------------------------
  /** When provided (with `onPaintChange`), the popover edits a full background
   *  paint — enabling the gradient + image kinds — instead of a solid color. */
  paint?: BackgroundPaint | null
  onPaintChange?: ((paint: BackgroundPaint) => void) | null
  // --- Design-token quick-pick ----------------------------------------------
  /** Selecting a color-token swatch calls this so the parent can bind the token
   *  semantically (agent rewrites to `var(--token)` / `text-primary`). When
   *  omitted, a token swatch just applies its resolved color. */
  onTokenSelect?: ((token: Token) => void) | null
}

type PaintKind = 'solid' | 'gradient' | 'image' | 'video' | 'pattern'

export function FillPopover({
  isOpen = false,
  onClose = null,
  anchorRef = null,
  hex = '050505',
  alpha = '100',
  onChangeColor = null,
  paint = null,
  onPaintChange = null,
  onTokenSelect = null,
}: FillPopoverProps = {}) {
  const fullMode = !!(paint && onPaintChange)
  const [format, setFormat] = useState('Hex')

  // The paint kind is derived from the controlled paint in full mode; solid-only
  // consumers stay on 'solid'.
  const kind: PaintKind = fullMode ? paint!.kind : 'solid'

  // Effective solid color driving the SV picker (in full mode, only when the
  // paint is actually solid).
  const solidHex = fullMode ? (paint!.kind === 'solid' ? paint!.hex : '050505') : hex
  const solidAlpha = fullMode ? (paint!.kind === 'solid' ? paint!.alpha : '100') : alpha

  const [hsv, setHsv] = useState(() => hexToHsv(solidHex))
  useEffect(() => {
    const current = hsvToHex(hsv.h, hsv.s, hsv.v)
    if (normalizeHex(current) !== normalizeHex(solidHex)) setHsv(hexToHsv(solidHex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solidHex])

  function changeColor(nextHex: string, nextAlpha: string) {
    if (fullMode) onPaintChange!(defaultSolid(normalizeHex(nextHex), nextAlpha))
    else onChangeColor?.(nextHex, nextAlpha)
  }

  function emitFromHsv(next: { h: number; s: number; v: number }) {
    setHsv(next)
    changeColor(hsvToHex(next.h, next.s, next.v), solidAlpha)
  }

  function switchKind(next: PaintKind) {
    if (!fullMode || next === kind) return
    if (next === 'solid') onPaintChange!(defaultSolid(solidHex, solidAlpha))
    else if (next === 'gradient') onPaintChange!(defaultGradient())
    else if (next === 'image') onPaintChange!(defaultImage())
  }

  const scrubAlpha = useScrubbable({
    value: solidAlpha,
    onChange: (v: string) => changeColor(solidHex, v),
    min: 0,
    max: 100,
  })

  const headerRight = <IconButton title="Add to library">{plusIcon}</IconButton>

  return (
    <Popover isOpen={isOpen} onClose={onClose} width={260} anchorRef={anchorRef} headerRight={headerRight} title="">
      <div style={{ padding: 10 }}>
        {/* Paint kind selector — gradient/image enabled only in full-paint mode. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 10 }}>
          {PAINT_KINDS.map(k => (
            <IconButton
              key={k.value}
              title={k.title}
              isActive={kind === k.value}
              isDisabled={
                k.value === 'video' || k.value === 'pattern' ||
                (!fullMode && k.value !== 'solid')
              }
              onClick={() => switchKind(k.value as PaintKind)}
            >
              {k.icon}
            </IconButton>
          ))}
          <div style={{ flex: 1 }} />
          <IconButton title="Noise" isDisabled>{noiseIcon}</IconButton>
        </div>

        {kind === 'solid' && (
          <SolidBody
            hue={hsv.h}
            saturation={hsv.s}
            colorValue={hsv.v}
            hex={solidHex}
            alpha={solidAlpha}
            format={format}
            scrubAlphaProps={scrubAlpha.prefixProps}
            onHueChange={h => emitFromHsv({ ...hsv, h })}
            onSVChange={({ s, v }) => emitFromHsv({ ...hsv, s, v })}
            onHexChange={v => changeColor(v, solidAlpha)}
            onAlphaChange={v => changeColor(solidHex, v)}
            onFormatChange={setFormat}
            onPickColor={changeColor}
            onTokenSelect={onTokenSelect}
          />
        )}

        {kind === 'gradient' && paint?.kind === 'gradient' && (
          <GradientBody value={paint} onChange={onPaintChange!} />
        )}
        {kind === 'image' && paint?.kind === 'image' && (
          <ImageBody value={paint} onChange={onPaintChange!} />
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
  /** Apply a resolved color (token quick-pick fallback). */
  onPickColor: (hex: string, alpha: string) => void
  /** Bind a color token semantically, when the parent supports it. */
  onTokenSelect: ((token: Token) => void) | null
}

function SolidBody({
  hue, saturation, colorValue, hex, alpha, format, scrubAlphaProps,
  onHueChange, onSVChange, onHexChange, onAlphaChange, onFormatChange,
  onPickColor, onTokenSelect,
}: SolidBodyProps) {
  const colorTokens = useTokensOf('color')
  const currentHex = normalizeHex(hex)
  const pickToken = (token: Token) => {
    if (onTokenSelect) onTokenSelect(token)
    else {
      const { hex: h, alphaPercent } = rgbStringToHexAlpha(token.value)
      onPickColor(h, alphaPercent)
    }
  }
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
            trackStyle={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          />
          <Slider
            value={Number(alpha) / 100}
            onChange={v => onAlphaChange(String(Math.round(v * 100)))}
            min={0}
            max={1}
            height={10}
            trackStyle={alphaTrack(hex)}
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
        <div style={hexBoxStyle}>
          <input
            type="text"
            value={hex}
            onChange={e => onHexChange(e.target.value)}
            style={hexInputStyle}
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

      {colorTokens.length > 0 && (
        <div style={{ marginTop: 2 }}>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>Tokens</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {colorTokens.map(token => {
              const selected = normalizeHex(rgbStringToHexAlpha(token.value).hex) === currentHex
              return (
                <span
                  key={token.id}
                  style={{
                    borderRadius: 5,
                    padding: 1,
                    display: 'inline-flex',
                    boxShadow: selected ? `0 0 0 2px ${COLORS.accent}` : 'none',
                  }}
                >
                  <ColorSwatch
                    color={token.value}
                    background={token.value}
                    size={18}
                    title={token.name}
                    onClick={() => pickToken(token)}
                  />
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact color editor — SV picker + hue + alpha + hex, for a gradient stop
// ---------------------------------------------------------------------------

function ColorEditor({ hex, alpha, onChange }: { hex: string; alpha: string; onChange: (hex: string, alpha: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(hex))
  useEffect(() => {
    const current = hsvToHex(hsv.h, hsv.s, hsv.v)
    if (normalizeHex(current) !== normalizeHex(hex)) setHsv(hexToHsv(hex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex])
  const emit = (next: { h: number; s: number; v: number }) => {
    setHsv(next)
    onChange(hsvToHex(next.h, next.s, next.v), alpha)
  }
  const scrubAlpha = useScrubbable({ value: alpha, onChange: (v: string) => onChange(hex, v), min: 0, max: 100 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SaturationValuePicker
        hue={hsv.h}
        saturation={hsv.s}
        value={hsv.v}
        onChange={sv => emit({ ...hsv, s: sv.saturation, v: sv.value })}
        height={130}
      />
      <Slider
        value={hsv.h}
        onChange={h => emit({ ...hsv, h })}
        min={0}
        max={360}
        height={10}
        trackStyle={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={hexBoxStyle}>
          <input type="text" value={hex} onChange={e => onChange(e.target.value, alpha)} style={hexInputStyle} />
        </div>
        <div style={{ width: 76, display: 'flex' }}>
          <NumericInput
            value={alpha}
            onChange={a => onChange(hex, a)}
            prefix={opacityIcon}
            suffix="%"
            ariaLabel="Stop alpha"
            prefixProps={scrubAlpha.prefixProps}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gradient body — type, angle, stops with per-stop color editing
// ---------------------------------------------------------------------------

const GRADIENT_TYPES = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
]

function GradientBody({ value, onChange }: { value: GradientPaint; onChange: (g: GradientPaint) => void }) {
  const barRef = useRef<HTMLDivElement | null>(null)
  // Track the active stop by id so it survives position sorting / drag-reorder.
  const [activeId, setActiveId] = useState<string>(() => value.stops[0]?.id ?? '')
  // Latest value for the drag move handler (which outlives a single render).
  const valueRef = useRef(value)
  valueRef.current = value

  const stops = value.stops
  const display = sortedStops(stops) // markers + list are ordered by position
  const active = stops.find(s => s.id === activeId) ?? display[0]
  const activeKey = active?.id ?? ''

  const previewCss = `linear-gradient(to right, ${display.map(s => `${swatchColor(s)} ${clampPos(s.position)}%`).join(', ')})`

  const setStops = (next: GradientStop[]) => onChange({ ...value, stops: next })
  const updateStop = (id: string, patch: Partial<GradientStop>) =>
    setStops(stops.map(s => (s.id === id ? { ...s, ...patch } : s)))

  function removeStop(id: string) {
    if (stops.length <= 2) return
    const next = stops.filter(s => s.id !== id)
    setStops(next)
    if (activeKey === id) setActiveId(sortedStops(next)[0]?.id ?? '')
  }
  function reverse() {
    setStops(stops.map(s => ({ ...s, position: String(100 - Number(s.position)) })))
  }

  function pctFromClientX(clientX: number): number {
    const r = barRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    return Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)))
  }

  /** Add a stop at `pct`, colored by interpolating the current gradient there. */
  function addStopAt(pct: number) {
    const col = stopColorAt(stops, pct)
    const id = newStopId()
    setStops([...stops, { id, hex: col.hex, alpha: col.alpha, position: String(pct) }])
    setActiveId(id)
  }
  /** The "+" button: insert between the first two stops (0 & 100 → 50). */
  function addStopBetweenFirstTwo() {
    const s = sortedStops(stops)
    const pct = s.length >= 2 ? Math.round((Number(s[0].position) + Number(s[1].position)) / 2) : 50
    addStopAt(pct)
  }

  /** Drag an existing stop along the bar. Reads `valueRef` so concurrent
   *  re-renders don't stale the other stops. */
  function startDrag(id: string, e: React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    setActiveId(id)
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* jsdom */ }
    const move = (ev: PointerEvent) => {
      const v = valueRef.current
      onChange({ ...v, stops: v.stops.map(s => (s.id === id ? { ...s, position: String(pctFromClientX(ev.clientX)) } : s)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Type + angle + reverse */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Dropdown value={value.type} onChange={t => onChange({ ...value, type: t as GradientPaint['type'] })} options={GRADIENT_TYPES} />
        </div>
        {value.type === 'linear' && (
          <div style={{ width: 74, display: 'flex' }}>
            <NumericInput value={value.angle} onChange={a => onChange({ ...value, angle: a })} suffix="°" ariaLabel="Angle" />
          </div>
        )}
        <IconButton title="Reverse stops" onClick={reverse}>{reverseIcon}</IconButton>
      </div>

      {/* Preview bar — click empty space to add a stop; markers drag / dbl-click to remove. */}
      <div
        ref={barRef}
        onPointerDown={e => addStopAt(pctFromClientX(e.clientX))}
        style={{ position: 'relative', height: 24, marginTop: 6, marginBottom: 6, background: previewCss, borderRadius: 4, border: `1px solid ${COLORS.border}`, cursor: 'copy', touchAction: 'none' }}
      >
        {display.map(s => (
          <button
            key={s.id}
            type="button"
            data-stop-marker=""
            title="Drag to move · double-click to remove"
            onPointerDown={e => startDrag(s.id!, e)}
            onDoubleClick={() => removeStop(s.id!)}
            style={{
              position: 'absolute', left: `calc(${clampPos(s.position)}% - 7px)`, top: -5,
              width: 14, height: 34, padding: 0, border: 'none', background: 'transparent',
              cursor: 'grab', touchAction: 'none',
            }}
          >
            <span style={{
              position: 'absolute', top: 5, left: 3, width: 8, height: 24,
              background: swatchColor(s),
              border: `2px solid ${activeKey === s.id ? COLORS.accentLight : '#fff'}`,
              borderRadius: 2, boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
            }} />
          </button>
        ))}
      </div>

      {/* Active stop color editor */}
      {active && (
        <ColorEditor
          hex={active.hex}
          alpha={active.alpha}
          onChange={(hex, alpha) => updateStop(active.id!, { hex: normalizeHex(hex), alpha })}
        />
      )}

      {/* Stops list (ordered by position) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: COLORS.label, fontWeight: 600 }}>Stops</div>
        <IconButton title="Add stop" onClick={addStopBetweenFirstTwo}>{plusIcon}</IconButton>
      </div>
      {display.map(s => (
        <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ColorSwatch color={swatchColor(s)} background={swatchColor(s)} size={18} onClick={() => setActiveId(s.id!)} />
          <div style={hexBoxStyle}>
            <input
              type="text"
              value={s.hex}
              onChange={e => updateStop(s.id!, { hex: e.target.value })}
              onFocus={() => setActiveId(s.id!)}
              style={hexInputStyle}
            />
          </div>
          <div style={{ width: 58, display: 'flex' }}>
            <NumericInput value={s.position} onChange={v => updateStop(s.id!, { position: v })} suffix="%" ariaLabel="Stop position" />
          </div>
          <IconButton title="Remove stop" onClick={() => removeStop(s.id!)}>{minusIcon}</IconButton>
        </div>
      ))}
    </div>
  )
}

const REPEAT_OPTIONS = [
  { value: 'no-repeat', label: 'No repeat' },
  { value: 'repeat', label: 'Repeat' },
  { value: 'repeat-x', label: 'Repeat X' },
  { value: 'repeat-y', label: 'Repeat Y' },
  { value: 'space', label: 'Space' },
  { value: 'round', label: 'Round' },
]

const SIZE_PRESETS = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'auto', label: 'Auto' },
  { value: '100% 100%', label: 'Stretch' },
]

/** The nine background-position anchors, as (x%, y%). */
const POSITION_ANCHORS = [
  { value: 'tl', label: 'Top left', x: '0', y: '0' },
  { value: 't', label: 'Top', x: '50', y: '0' },
  { value: 'tr', label: 'Top right', x: '100', y: '0' },
  { value: 'l', label: 'Left', x: '0', y: '50' },
  { value: 'c', label: 'Center', x: '50', y: '50' },
  { value: 'r', label: 'Right', x: '100', y: '50' },
  { value: 'bl', label: 'Bottom left', x: '0', y: '100' },
  { value: 'b', label: 'Bottom', x: '50', y: '100' },
  { value: 'br', label: 'Bottom right', x: '100', y: '100' },
]

const POS_H: Record<string, string> = { left: '0', center: '50', right: '100' }
const POS_V: Record<string, string> = { top: '0', center: '50', bottom: '100' }

/** Parse a `background-position` into x/y percentage strings (best-effort:
 *  keywords and %/px numbers; px is read as its number). */
function parsePosition(pos: string): { x: string; y: string } {
  const toks = (pos || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const num = (s: string): string | null => {
    const m = s.match(/^(-?[\d.]+)(?:%|px)?$/)
    return m ? m[1] : null
  }
  if (toks.length === 0) return { x: '50', y: '50' }
  if (toks.length === 1) {
    const t = toks[0]
    if (t === 'top' || t === 'bottom') return { x: '50', y: POS_V[t] }
    if (t in POS_H) return { x: POS_H[t], y: '50' }
    return { x: num(t) ?? '50', y: '50' }
  }
  let [a, b] = toks
  // Keyword pairs may be written vertical-first ("top left") — normalize.
  if ((a === 'top' || a === 'bottom') && b in POS_H) [a, b] = [b, a]
  const x = a in POS_H ? POS_H[a] : num(a) ?? '50'
  const y = b in POS_V ? POS_V[b] : num(b) ?? '50'
  return { x, y }
}

// ---------------------------------------------------------------------------
// Image body — url, preview, size, position, repeat
// ---------------------------------------------------------------------------

function ImageBody({ value, onChange }: { value: ImagePaint; onChange: (img: ImagePaint) => void }) {
  const previewBg = value.url
    ? `${value.position} / ${sizeForPreview(value.size)} ${value.repeat} url("${value.url}")`
    : undefined
  // Whether the current size matches a named preset (else it's a custom value).
  const preset = SIZE_PRESETS.some(p => p.value === value.size) ? value.size : 'custom'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          height: 96,
          borderRadius: 6,
          border: `1px ${value.url ? 'solid' : 'dashed'} ${COLORS.border}`,
          background: previewBg ?? COLORS.input,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: COLORS.muted, fontSize: 12,
        }}
      >
        {value.url ? '' : 'Paste an image URL below'}
      </div>

      <FieldRow label="URL">
        <input
          type="text"
          value={value.url}
          placeholder="https://…"
          onChange={e => onChange({ ...value, url: e.target.value.trim() })}
          style={hexInputStyle}
        />
      </FieldRow>

      <FieldRow label="Size">
        <Dropdown
          value={preset}
          onChange={v => onChange({ ...value, size: v === 'custom' ? '100px 100px' : v })}
          options={[...SIZE_PRESETS, { value: 'custom', label: 'Custom' }]}
        />
      </FieldRow>
      {/* Custom size gets its own row below the dropdown (the dropdown is
          width:100%, so an input beside it in the same row collapses to zero) —
          matching the Position row's X/Y inputs. */}
      {preset === 'custom' && (
        <FieldRow label="">
          <div style={{ ...hexBoxStyle, flex: 1 }}>
            <input
              type="text"
              value={value.size}
              placeholder="e.g. 100px 100px"
              onChange={e => onChange({ ...value, size: e.target.value })}
              style={hexInputStyle}
            />
          </div>
        </FieldRow>
      )}

      {(() => {
        const { x, y } = parsePosition(value.position)
        const anchor = POSITION_ANCHORS.find(a => a.x === x && a.y === y)?.value ?? 'custom'
        return (
          <>
            <FieldRow label="Position">
              <Dropdown
                value={anchor}
                onChange={v => {
                  const a = POSITION_ANCHORS.find(o => o.value === v)
                  if (a) onChange({ ...value, position: `${a.x}% ${a.y}%` })
                }}
                options={[...POSITION_ANCHORS.map(a => ({ value: a.value, label: a.label })), { value: 'custom', label: 'Custom' }]}
              />
            </FieldRow>
            <FieldRow label="">
              <div style={{ width: '50%', display: 'flex' }}>
                <NumericInput value={x} suffix="%" ariaLabel="Position X" prefix="X" onChange={nx => onChange({ ...value, position: `${nx}% ${y}%` })} />
              </div>
              <div style={{ width: '50%', display: 'flex' }}>
                <NumericInput value={y} suffix="%" ariaLabel="Position Y" prefix="Y" onChange={ny => onChange({ ...value, position: `${x}% ${ny}%` })} />
              </div>
            </FieldRow>
          </>
        )
      })()}

      <FieldRow label="Repeat">
        <Dropdown value={value.repeat} onChange={v => onChange({ ...value, repeat: v })} options={REPEAT_OPTIONS} />
      </FieldRow>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 58, fontSize: 11, color: COLORS.label, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared style bits + helpers
// ---------------------------------------------------------------------------

const hexBoxStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 8px',
  background: COLORS.input, borderRadius: 4, height: SIZES.rowHeight,
}
const hexInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
  color: COLORS.text, fontSize: 12, fontFamily: 'inherit', padding: 0,
}

function alphaTrack(hex: string): React.CSSProperties {
  return {
    backgroundImage: `
      linear-gradient(to right, rgba(0,0,0,0), #${hex}),
      linear-gradient(45deg, #333 25%, transparent 25%),
      linear-gradient(-45deg, #333 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #333 75%),
      linear-gradient(-45deg, transparent 75%, #333 75%)
    `,
    backgroundSize: '100% 100%, 6px 6px, 6px 6px, 6px 6px, 6px 6px',
    backgroundPosition: '0 0, 0 0, 0 3px, 3px -3px, -3px 0',
  }
}

/** rgba() for a stop, honoring its alpha, for previews + swatches. */
function swatchColor(s: GradientStop): string {
  const a = Math.max(0, Math.min(100, parseFloat(s.alpha) || 0)) / 100
  const h = normalizeHex(s.hex).padEnd(6, '0')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function clampPos(p: string): number {
  return Math.max(0, Math.min(100, parseFloat(p) || 0))
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).padEnd(6, '0')
  return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 }
}
function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

/** Interpolate the gradient's color at `pct` (0..100) so a stop added there
 *  starts out matching the gradient at that point. */
function stopColorAt(stops: GradientStop[], pct: number): { hex: string; alpha: string } {
  const s = sortedStops(stops)
  if (s.length === 0) return { hex: 'CCCCCC', alpha: '100' }
  if (pct <= Number(s[0].position)) return { hex: normalizeHex(s[0].hex), alpha: s[0].alpha }
  const last = s[s.length - 1]
  if (pct >= Number(last.position)) return { hex: normalizeHex(last.hex), alpha: last.alpha }
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]
    const b = s[i + 1]
    const pa = Number(a.position)
    const pb = Number(b.position)
    if (pct >= pa && pct <= pb) {
      const t = pb === pa ? 0 : (pct - pa) / (pb - pa)
      const ca = hexRgb(a.hex)
      const cb = hexRgb(b.hex)
      const alpha = String(Math.round(Number(a.alpha) + (Number(b.alpha) - Number(a.alpha)) * t))
      return { hex: toHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t), alpha }
    }
  }
  return { hex: normalizeHex(s[0].hex), alpha: s[0].alpha }
}

/** `auto`/`cover`/`contain` are valid in the `background` shorthand; a bare
 *  custom size is too, but guard empties. */
function sizeForPreview(size: string): string {
  return size && size.trim() ? size : 'auto'
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
    <circle cx="4" cy="4" r="1" /><circle cx="8" cy="4" r="1" /><circle cx="12" cy="4" r="1" />
    <circle cx="4" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12" cy="8" r="1" />
    <circle cx="4" cy="12" r="1" /><circle cx="8" cy="12" r="1" /><circle cx="12" cy="12" r="1" />
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
    <circle cx="3" cy="4" r="0.7" /><circle cx="7" cy="3" r="0.7" /><circle cx="11" cy="5" r="0.7" />
    <circle cx="5" cy="7" r="0.7" /><circle cx="9" cy="8" r="0.7" /><circle cx="13" cy="9" r="0.7" />
    <circle cx="4" cy="11" r="0.7" /><circle cx="8" cy="12" r="0.7" /><circle cx="12" cy="13" r="0.7" />
  </svg>
)

const reverseIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M 4 5 H 11 M 4 5 L 6 3 M 4 5 L 6 7" />
    <path d="M 12 11 H 5 M 12 11 L 10 9 M 12 11 L 10 13" />
  </svg>
)
