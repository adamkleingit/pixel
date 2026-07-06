import { useEffect, useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { Dropdown } from './Dropdown'
import { FillPopover } from './FillPopover'
import { NumericInput } from './NumericInput'
import { PaintRow } from './PaintRow'
import { Row } from './Row'
import { Section } from './Section'
import { StrokeSettingsPopover } from './StrokeSettingsPopover'
import { TokenButton } from './TokenButton'
import { slidersIcon } from './icons'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { tokenDisplayLabel } from './token-mapping'
import { useScrubbable, type ScrubExtras } from './useScrubbable'
import { useTokenMatch } from './useTokenMatch'
import { composeBorder, normalizeHex, readBorder, rgbStringToHexAlpha } from '../edit/color'

export interface StrokeSectionProps {
  elements?: Element[]
}

/**
 * Stroke = the element's CSS `border`. It's a single value — CSS can't stack two
 * borders (a second would just override the first), so this section edits ONE
 * stroke: a colour row plus section-level Position + Weight. The eye toggles the
 * border on/off; there's no add/remove because there's only ever one.
 */
export function StrokeSection({ elements = [] }: StrokeSectionProps = {}) {
  const [hex, setHex] = useState('000000')
  const [alpha, setAlpha] = useState('100')
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState('Outside')
  const [weight, setWeight] = useState('1')
  const [style, setStyle] = useState('solid')
  const [colorShared, setColorShared] = useState<'single' | 'multiple'>('single')
  const [weightShared, setWeightShared] = useState<'single' | 'multiple'>('single')
  const [isColorOpen, setIsColorOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const colorAnchorRef = useRef<HTMLDivElement | null>(null)
  const settingsAnchorRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (elements.length === 0) return
    // Compare borders by their composite signature so divergent elements surface
    // as "Multiple" without six separate readShared calls.
    const sig = readShared(elements, el => {
      const b = readBorder(el)
      return `${b.widthPx}|${b.style}|${b.hex}|${b.alphaPercent}`
    })
    if (sig.kind === 'multiple') {
      setColorShared('multiple')
      setWeightShared('multiple')
      setHex(''); setAlpha(''); setWeight(''); setStyle('solid'); setIsVisible(true)
      return
    }
    const b = readBorder(elements[0])
    const hasOpaqueBorder =
      parseFloat(b.widthPx) > 0 && b.style !== 'none' && b.alphaPercent !== '0'
    setColorShared('single')
    setWeightShared('single')
    if (hasOpaqueBorder) {
      setHex(b.hex); setAlpha(b.alphaPercent); setWeight(b.widthPx); setStyle(b.style)
      setIsVisible(true)
    } else {
      setHex('000000'); setAlpha('100'); setWeight('1'); setStyle('solid')
      setIsVisible(false)
    }
  }, [elements])

  function apply(nextHex: string, nextAlpha: string, nextVisible: boolean, nextWeight: string, nextStyle: string) {
    const value = nextVisible && nextHex
      ? composeBorder({
          widthPx: nextWeight || '1',
          style: nextStyle,
          hex: nextHex,
          alphaPercent: nextAlpha || '100',
        })
      : 'none'
    applyPatchAll(elements, { kind: 'setStyle', property: 'border', value })
  }

  function onHex(v: string) {
    const norm = normalizeHex(v)
    setHex(norm); setColorShared('single')
    // Typing a colour implies the stroke should show.
    if (!isVisible) setIsVisible(true)
    apply(norm, alpha || '100', true, weight, style)
  }
  function onAlpha(v: string) {
    setAlpha(v); setColorShared('single')
    apply(hex, v, isVisible, weight, style)
  }
  function onVisibility(v: boolean) {
    setIsVisible(v); setColorShared('single')
    apply(hex, alpha, v, weight, style)
  }
  function onColorFromPopover(nextHex: string, nextAlpha: string) {
    const norm = normalizeHex(nextHex)
    setHex(norm); setAlpha(nextAlpha); setColorShared('single')
    if (!isVisible) setIsVisible(true)
    apply(norm, nextAlpha, true, weight, style)
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
    apply(hex, alpha, isVisible, v, style)
  }
  function onColorToken(token: Token) {
    // Write the longhand so the agent can rewrite to `border-color:
    // var(--primary)` / `border-primary` (utility) instead of the shorthand
    // (which can't carry a single semantic token). Ensure the border is visible.
    applyTokenAll(elements, 'border-color', token)
    // Base the width/style top-up on the LIVE border, not the (possibly stale)
    // state — an element with `border: none` reads weight '1' in state but paints
    // a 0px border, so picking a color must still give it a visible stroke.
    const live = elements[0] ? getComputedStyle(elements[0]) : null
    if (!live || (parseFloat(live.borderTopWidth) || 0) <= 0) {
      applyPatchAll(elements, { kind: 'setStyle', property: 'border-width', value: '1px' })
      setWeight('1')
    }
    if (!live || live.borderTopStyle === 'none') {
      applyPatchAll(elements, { kind: 'setStyle', property: 'border-style', value: 'solid' })
      setStyle('solid')
    }
    const parsed = rgbStringToHexAlpha(token.value)
    setHex(parsed.hex); setAlpha(parsed.alphaPercent); setIsVisible(true); setColorShared('single')
  }
  function onWidthToken(token: Token) {
    applyTokenAll(elements, 'border-width', token)
    const m = /^(-?[\d.]+)/.exec(token.value.trim())
    if (m) { setWeight(m[1]); setWeightShared('single') }
  }

  const widthMatch = useTokenMatch('border-width')
  const widthTokenLabel = weightShared === 'single' ? tokenDisplayLabel(widthMatch.matchToken(weight ? `${weight}px` : '')) : null
  const scrubWeight = useScrubbable({
    value: weight,
    onChange: onWeight,
    min: 0,
    snap: { targets: widthMatch.snapTargets, threshold: 3 },
  })

  return (
    <Section title="Stroke">
      <div ref={colorAnchorRef}>
        <PaintRow
          hex={hex}
          hexPlaceholder={colorShared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
          swatchColor={colorShared === 'multiple' ? 'transparent' : `#${hex}`}
          swatchBackground={colorShared === 'multiple' ? 'transparent' : `#${hex}`}
          alpha={alpha}
          alphaPlaceholder={colorShared === 'multiple' ? '–' : ''}
          isVisible={isVisible}
          disabled={colorShared === 'multiple'}
          onHexChange={onHex}
          onAlphaChange={onAlpha}
          onVisibilityChange={onVisibility}
          onSwatchClick={() => setIsColorOpen(v => !v)}
          tokenProperty="border-color"
          onTokenSelect={onColorToken}
        />
      </div>

      <FillPopover
        isOpen={isColorOpen}
        onClose={() => setIsColorOpen(false)}
        anchorRef={colorAnchorRef}
        hex={hex || '000000'}
        alpha={alpha || '100'}
        onChangeColor={onColorFromPopover}
        onTokenSelect={onColorToken}
      />

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
