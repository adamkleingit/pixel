import { useEffect, useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { Dropdown } from './Dropdown'
import { FillPopover } from './FillPopover'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { PaintRow } from './PaintRow'
import { Row } from './Row'
import { Section } from './Section'
import { StrokeSettingsPopover } from './StrokeSettingsPopover'
import { TokenButton } from './TokenButton'
import { plusIcon, slidersIcon } from './icons'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { useScrubbable, type ScrubExtras } from './useScrubbable'
import { useTokenMatch } from './useTokenMatch'
import { composeBorder, normalizeHex, readBorder, rgbStringToHexAlpha } from '../edit/color'

export interface StrokeSectionProps {
  elements?: Element[]
}

type Stroke = {
  id: string
  hex: string
  alpha: string
  isVisible: boolean
}

let nextId = 1
const mkId = () => `stroke-${nextId++}`

export function StrokeSection({ elements = [] }: StrokeSectionProps = {}) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [position, setPosition] = useState('Outside')
  const [weight, setWeight] = useState('1')
  const [weightShared, setWeightShared] = useState<'single' | 'multiple'>('single')
  const [style, setStyle] = useState('solid')
  const [colorShared, setColorShared] = useState<'single' | 'multiple'>('single')
  const [colorPopoverId, setColorPopoverId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const colorAnchorsRef = useRef<Record<string, HTMLElement | null>>({})
  const settingsAnchorRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (elements.length === 0) { setStrokes([]); return }
    // Compare borders by their composite signature so divergent elements
    // surface as "Multiple" without us needing six separate readShared calls.
    const sig = readShared(elements, el => {
      const b = readBorder(el)
      return `${b.widthPx}|${b.style}|${b.hex}|${b.alphaPercent}`
    })
    if (sig.kind === 'multiple') {
      setColorShared('multiple')
      setWeightShared('multiple')
      setStrokes([{ id: mkId(), hex: '', alpha: '', isVisible: true }])
      setWeight('')
      setStyle('solid')
      return
    }
    const b = readBorder(elements[0])
    const hasOpaqueBorder =
      parseFloat(b.widthPx) > 0 && b.style !== 'none' && b.alphaPercent !== '0'
    setColorShared('single')
    setWeightShared('single')
    if (hasOpaqueBorder) {
      setStrokes([{ id: mkId(), hex: b.hex, alpha: b.alphaPercent, isVisible: true }])
      setWeight(b.widthPx)
      setStyle(b.style)
    } else {
      setStrokes([])
      setWeight('1')
      setStyle('solid')
    }
  }, [elements])

  function applyToElement(
    nextStrokes: Stroke[],
    nextWeight: string,
    nextStyle: string,
  ) {
    const active = nextStrokes.find(s => s.isVisible)
    const value = active && active.hex
      ? composeBorder({
          widthPx: nextWeight || '1',
          style: nextStyle,
          hex: active.hex,
          alphaPercent: active.alpha || '100',
        })
      : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'border', value: value || 'none' })
  }

  function updateStroke(id: string, patch: Partial<Stroke>) {
    setColorShared('single')
    setStrokes(prev => {
      const next = prev.map(s => {
        if (s.id !== id) return s
        const merged = { ...s, ...patch }
        if (typeof patch.hex === 'string') merged.hex = normalizeHex(patch.hex)
        return merged
      })
      applyToElement(next, weight, style)
      return next
    })
  }
  function removeStroke(id: string) {
    setStrokes(prev => {
      const next = prev.filter(s => s.id !== id)
      applyToElement(next, weight, style)
      return next
    })
    if (colorPopoverId === id) setColorPopoverId(null)
  }
  function addStroke() {
    setStrokes(prev => {
      const next = [...prev, { id: mkId(), hex: '000000', alpha: '100', isVisible: true }]
      applyToElement(next, weight, style)
      return next
    })
  }
  function onWeight(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setWeight(v); setWeightShared('single')
    if (extras?.snappedToken) {
      applyTokenAll(elements, 'border-width', extras.snappedToken)
      return
    }
    const typed = widthMatch.matchToken(v ? `${v}px` : '')
    if (typed) {
      applyTokenAll(elements, 'border-width', typed)
      return
    }
    applyToElement(strokes, v, style)
  }
  function onColorTokenForRow(id: string, token: Token) {
    // Write the longhands so the agent can rewrite to `border-color:
    // var(--primary)` / `border-primary` (utility) instead of the shorthand
    // (which can't carry a single semantic token).
    applyTokenAll(elements, 'border-color', token)
    // Ensure the border is actually visible — set sensible defaults if the
    // element has none yet.
    if (!weight || weight === '0') {
      applyPatchAll(elements, { kind: 'setStyle', property: 'border-width', value: '1px' })
      setWeight('1')
    }
    if (!style || style === 'none') {
      applyPatchAll(elements, { kind: 'setStyle', property: 'border-style', value: 'solid' })
      setStyle('solid')
    }
    const parsed = rgbStringToHexAlpha(token.value)
    setStrokes(prev => prev.map(s =>
      s.id === id ? { ...s, hex: parsed.hex, alpha: parsed.alphaPercent, isVisible: true } : s,
    ))
    setColorShared('single')
  }
  function onWidthToken(token: Token) {
    applyTokenAll(elements, 'border-width', token)
    const m = /^(-?[\d.]+)/.exec(token.value.trim())
    if (m) {
      setWeight(m[1])
      setWeightShared('single')
    }
  }

  const widthMatch = useTokenMatch('border-width')
  const widthTokenLabel = weightShared === 'single' ? widthMatch.matchToken(weight ? `${weight}px` : '')?.name ?? null : null
  const scrubWeight = useScrubbable({
    value: weight,
    onChange: onWeight,
    min: 0,
    snap: { targets: widthMatch.snapTargets, threshold: 3 },
  })

  const actions = (
    <IconButton title="Add stroke" onClick={addStroke}>{plusIcon}</IconButton>
  )

  const activeColorAnchorRef = {
    get current() {
      return colorPopoverId ? colorAnchorsRef.current[colorPopoverId] ?? null : null
    },
  }
  const activeStroke = colorPopoverId
    ? strokes.find(s => s.id === colorPopoverId) ?? null
    : null

  return (
    <Section title="Stroke" actions={actions}>
      {strokes.map(stroke => (
        <div
          key={stroke.id}
          ref={el => {
            colorAnchorsRef.current[stroke.id] = el
          }}
        >
          <PaintRow
            hex={stroke.hex}
            hexPlaceholder={colorShared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
            swatchColor={colorShared === 'multiple' ? 'transparent' : `#${stroke.hex}`}
            swatchBackground={colorShared === 'multiple' ? 'transparent' : `#${stroke.hex}`}
            alpha={stroke.alpha}
            alphaPlaceholder={colorShared === 'multiple' ? '–' : ''}
            isVisible={stroke.isVisible}
            disabled={colorShared === 'multiple'}
            onHexChange={v => updateStroke(stroke.id, { hex: v })}
            onAlphaChange={v => updateStroke(stroke.id, { alpha: v })}
            onVisibilityChange={v => updateStroke(stroke.id, { isVisible: v })}
            onSwatchClick={() =>
              setColorPopoverId(prev => (prev === stroke.id ? null : stroke.id))
            }
            onRemove={() => removeStroke(stroke.id)}
            tokenProperty="border-color"
            onTokenSelect={t => onColorTokenForRow(stroke.id, t)}
          />
        </div>
      ))}

      <FillPopover
        isOpen={colorPopoverId !== null}
        onClose={() => setColorPopoverId(null)}
        anchorRef={activeColorAnchorRef}
        hex={activeStroke?.hex ?? '000000'}
        alpha={activeStroke?.alpha ?? '100'}
        onChangeColor={(hex, alpha) => {
          if (colorPopoverId) updateStroke(colorPopoverId, { hex, alpha })
        }}
      />

      {strokes.length > 0 && (
        <Row label="">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
              gap: 6,
              width: '100%',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: '#7a7a8e', marginBottom: 4 }}>
                Position
              </div>
              <Dropdown
                value={position}
                onChange={setPosition}
                options={['Inside', 'Center', 'Outside'].map(v => ({ value: v }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#7a7a8e', marginBottom: 4 }}>
                Weight
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <NumericInput
                  value={weight}
                  placeholder={weightShared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
                  disabled={weightShared === 'multiple'}
                  onChange={onWeight}
                  prefix={weightPrefix}
                  prefixProps={scrubWeight.prefixProps}
                  tokenLabel={widthTokenLabel}
                />
                <TokenButton property="border-width" onSelect={onWidthToken} />
              </div>
            </div>
            <div style={{ alignSelf: 'end' }}>
              <button
                ref={settingsAnchorRef}
                type="button"
                title="Advanced stroke settings"
                onClick={() => setIsSettingsOpen(v => !v)}
                style={{
                  width: 28,
                  height: 28,
                  background: isSettingsOpen ? '#2a2a3a' : 'transparent',
                  color: isSettingsOpen ? '#8b92ff' : '#8a8a9e',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'inherit',
                }}
              >
                {slidersIcon}
              </button>
              <StrokeSettingsPopover
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                anchorRef={settingsAnchorRef}
              />
            </div>
          </div>
        </Row>
      )}
    </Section>
  )
}

const weightPrefix = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <line x1="2" y1="3.5" x2="10" y2="3.5" strokeWidth="1" />
    <line x1="2" y1="6" x2="10" y2="6" strokeWidth="1.5" />
    <line x1="2" y1="9" x2="10" y2="9" strokeWidth="2.2" />
  </svg>
)
