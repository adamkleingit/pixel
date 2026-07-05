import { useEffect, useMemo, useState } from 'react'
import type { Token } from '../pixel-common'
import { DimensionInput } from './DimensionInput'
import { Dropdown } from './Dropdown'
import { IconButton } from './IconButton'
import { NumericDropdown } from './NumericDropdown'
import { Row } from './Row'
import { Section } from './Section'
import { SegmentedButtonGroup } from './SegmentedButtonGroup'
import { TokenButton } from './TokenButton'
import { slidersIcon } from './icons'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { tokenDisplayLabel } from './token-mapping'
import { useScrubbable, type ScrubExtras } from './useScrubbable'
import { useTokenMatch } from './useTokenMatch'
import { useTokensOf } from '../tokens-context'
import { LETTER_SPACING_OPTIONS, LINE_HEIGHT_OPTIONS } from '../edit/dimension'
import { readExplicit } from '../edit/read-explicit'
import {
  FONT_WEIGHT_VALUES,
  fontWeightName,
  readFontFamilyFirst,
  readFontWeightName,
  readPx,
  readRaw,
} from '../edit/read-computed'

export interface TypographySectionProps {
  elements?: Element[]
}

type HTextAlign = 'left' | 'center' | 'right'
type VTextAlign = 'top' | 'middle' | 'bottom'

// Native + commonly-available system fonts. Anything the design tokens add
// (e.g. `font-family` tokens) is merged on top inside the component, so a
// project's own font stack shows up alphabetically alongside the platform ones.
const NATIVE_FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'System UI',
  '-apple-system',
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'SF Pro',
  'SF Pro Display',
  'SF Pro Text',
  'Segoe UI',
  'Tahoma',
  'Trebuchet MS',
  'Verdana',
  'Times New Roman',
  'Times',
  'Georgia',
  'Garamond',
  'Palatino',
  'Courier New',
  'Courier',
  'Consolas',
  'Menlo',
  'Monaco',
  'Lucida Console',
].map(v => ({ value: v, label: v }))

const FONT_WEIGHTS = [
  'Thin',
  'Light',
  'Regular',
  'Medium',
  'Semibold',
  'Bold',
  'Black',
].map(v => ({ value: v, label: v }))

const FONT_SIZES = ['10', '11', '12', '13', '14', '15', '16', '20', '24', '32', '36', '40', '48', '64']

export function TypographySection({ elements = [] }: TypographySectionProps = {}) {
  const [family, setFamily] = useState('Roboto')
  const [familyShared, setFamilyShared] = useState<'single' | 'multiple'>('single')
  const [weight, setWeight] = useState('Regular')
  const [weightShared, setWeightShared] = useState<'single' | 'multiple'>('single')
  const [size, setSize] = useState('12')
  const [sizeShared, setSizeShared] = useState<'single' | 'multiple'>('single')
  const [lineHeight, setLineHeight] = useState('140.6')
  const [letterSpacing, setLetterSpacing] = useState('0')
  const [hAlign, setHAlign] = useState<HTextAlign | null>('left')
  const [vAlign, setVAlign] = useState<VTextAlign | null>('top')

  useEffect(() => {
    if (elements.length === 0) return
    const fam = readShared(elements, el => readFontFamilyFirst(el) || 'Roboto')
    setFamily(fam.kind === 'single' ? fam.value : '')
    setFamilyShared(fam.kind === 'multiple' ? 'multiple' : 'single')
    const wt = readShared(elements, readFontWeightName)
    setWeight(wt.kind === 'single' ? wt.value : '')
    setWeightShared(wt.kind === 'multiple' ? 'multiple' : 'single')
    const sz = readShared(elements, el => readPx(el, 'font-size') || '12')
    setSize(sz.kind === 'single' ? sz.value : '')
    setSizeShared(sz.kind === 'multiple' ? 'multiple' : 'single')
    // Line-height / letter-spacing keep their authored unit (unitless, px, em,
    // %, normal) — read the explicit value, falling back to the computed one.
    const lh = readShared(elements, el => readExplicit(el, 'line-height').value || readRaw(el, 'line-height'))
    setLineHeight(lh.kind === 'single' ? lh.value : '')
    const ls = readShared(elements, el => readExplicit(el, 'letter-spacing').value || readRaw(el, 'letter-spacing'))
    setLetterSpacing(ls.kind === 'single' ? ls.value : '')
    const ha = readShared(elements, el => readHAlign(el))
    setHAlign(ha.kind === 'single' ? (ha.value as HTextAlign) : null)
    const va = readShared(elements, el => readVAlign(el))
    setVAlign(va.kind === 'single' ? (va.value as VTextAlign) : null)
  }, [elements])

  function onFamily(v: string) {
    setFamily(v); setFamilyShared('single')
    applyPatchAll(elements, { kind: 'setStyle', property: 'font-family', value: v })
  }
  function onFamilyToken(token: Token) {
    applyTokenAll(elements, 'font-family', token)
    setFamily(token.value)
    setFamilyShared('single')
  }
  function onWeightToken(token: Token) {
    applyTokenAll(elements, 'font-weight', token)
    // Weight tokens carry a numeric value (e.g. `700`); the dropdown shows named
    // weights, so bucket it back to a name so the control reflects the pick.
    setWeight(fontWeightName(token.value))
    setWeightShared('single')
  }
  function onSizeToken(token: Token) {
    applyTokenAll(elements, 'font-size', token)
    const m = /^(-?[\d.]+)/.exec(token.value.trim())
    if (m) setSize(m[1])
    setSizeShared('single')
  }
  function onLineHeightToken(token: Token) {
    applyTokenAll(elements, 'line-height', token)
    setLineHeight(token.value)
  }
  function onLetterSpacingToken(token: Token) {
    applyTokenAll(elements, 'letter-spacing', token)
    setLetterSpacing(token.value)
  }
  function onWeight(v: string) {
    setWeight(v); setWeightShared('single')
    const css = FONT_WEIGHT_VALUES[v] ?? ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'font-weight', value: css })
  }
  function onSize(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setSize(v); setSizeShared('single')
    if (extras?.snappedToken) {
      applyTokenAll(elements, 'font-size', extras.snappedToken)
      return
    }
    const typed = sizeMatch.matchToken(v ? `${v}px` : '')
    if (typed) {
      applyTokenAll(elements, 'font-size', typed)
      return
    }
    applyPatchAll(elements, { kind: 'setStyle', property: 'font-size', value: v ? `${v}px` : '' })
  }
  function onLineHeight(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setLineHeight(v)
    if (extras?.snappedToken) {
      applyTokenAll(elements, 'line-height', extras.snappedToken)
      return
    }
    const typed = lineHeightMatch.matchToken(v)
    if (typed) {
      applyTokenAll(elements, 'line-height', typed)
      return
    }
    applyPatchAll(elements, { kind: 'setStyle', property: 'line-height', value: v })
  }
  function onLetterSpacing(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setLetterSpacing(v)
    if (extras?.snappedToken) {
      applyTokenAll(elements, 'letter-spacing', extras.snappedToken)
      return
    }
    const typed = letterSpacingMatch.matchToken(v)
    if (typed) {
      applyTokenAll(elements, 'letter-spacing', typed)
      return
    }
    // `v` already carries its unit (composed by DimensionInput) — write it as-is.
    applyPatchAll(elements, { kind: 'setStyle', property: 'letter-spacing', value: v })
  }
  function onHAlign(v: HTextAlign) {
    setHAlign(v)
    for (const el of elements) {
      applyPatchAll([el], { kind: 'setStyle', property: 'text-align', value: v })
      if (isFlex(el)) {
        applyPatchAll([el], { kind: 'setStyle', property: 'justify-content', value: H_TO_JUSTIFY[v] })
      }
    }
  }
  function onVAlign(v: VTextAlign) {
    setVAlign(v)
    for (const el of elements) {
      if (isFlex(el)) {
        applyPatchAll([el], { kind: 'setStyle', property: 'align-items', value: V_TO_ALIGN[v] })
      } else {
        applyPatchAll([el], { kind: 'setStyle', property: 'vertical-align', value: V_TO_VERTICAL_ALIGN[v] })
      }
    }
  }

  // Merge any font-family tokens from the design system into the dropdown.
  // The dropdown matches by `value`, so picking a token via the token button
  // (which sets `family` to `token.value`) lands on the option with the token's
  // human name as its label instead of falling through to the '–' placeholder.
  // Token options come first so project fonts surface above the generic list.
  const fontTokens = useTokensOf('font-family')
  const familyOptions = useMemo(() => {
    const tokenOpts = fontTokens.map(t => ({ value: t.value, label: t.name }))
    const seen = new Set<string>(tokenOpts.map(o => o.value))
    const natives = NATIVE_FONT_FAMILIES.filter(o => !seen.has(o.value))
    const merged = [...tokenOpts, ...natives]
    // If the current resolved value isn't in either list (e.g. a custom stack
    // typed in source), surface it so the dropdown still shows a label rather
    // than '–'. The first family from the stack reads cleanest.
    if (family && familyShared === 'single' && !merged.some(o => o.value === family)) {
      const firstName = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '') || family
      merged.unshift({ value: family, label: firstName })
    }
    return merged
  }, [fontTokens, family, familyShared])

  const sizeMatch = useTokenMatch('font-size')
  const lineHeightMatch = useTokenMatch('line-height')
  const letterSpacingMatch = useTokenMatch('letter-spacing')
  const sizeTokenLabel = sizeShared === 'single' ? tokenDisplayLabel(sizeMatch.matchToken(size ? `${size}px` : '')) : null
  const lineHeightTokenLabel = tokenDisplayLabel(lineHeightMatch.matchToken(lineHeight))
  const letterSpacingTokenLabel = tokenDisplayLabel(letterSpacingMatch.matchToken(letterSpacing))
  const scrubSize = useScrubbable({
    value: size,
    onChange: onSize,
    min: 1,
    snap: { targets: sizeMatch.snapTargets, threshold: 3 },
  })

  return (
    <Section title="Typography">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Dropdown
            value={familyShared === 'multiple' ? '' : family}
            placeholder={familyShared === 'multiple' ? MULTIPLE_PLACEHOLDER : undefined}
            disabled={familyShared === 'multiple'}
            onChange={onFamily}
            options={familyOptions}
          />
        </div>
        <TokenButton property="font-family" onSelect={onFamilyToken} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Dropdown
            value={weightShared === 'multiple' ? '' : weight}
            placeholder={weightShared === 'multiple' ? MULTIPLE_PLACEHOLDER : undefined}
            disabled={weightShared === 'multiple'}
            onChange={onWeight}
            options={FONT_WEIGHTS}
          />
        </div>
        <TokenButton property="font-weight" onSelect={onWeightToken} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <NumericDropdown
          value={size}
          placeholder={sizeShared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
          disabled={sizeShared === 'multiple'}
          onChange={onSize}
          options={FONT_SIZES}
          ariaLabel="Font size"
          prefixProps={scrubSize.prefixProps}
          tokenLabel={sizeTokenLabel}
        />
        <TokenButton property="font-size" onSelect={onSizeToken} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
        <Row label="Line height">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <DimensionInput
              prefix={lineHeightPrefix}
              ariaLabel="Line height"
              value={lineHeight}
              onChange={onLineHeight}
              options={LINE_HEIGHT_OPTIONS}
              min={0}
              step={0.1}
              snap={{ targets: lineHeightMatch.snapTargets, threshold: 3 }}
              tokenLabel={lineHeightTokenLabel}
            />
            <TokenButton property="line-height" onSelect={onLineHeightToken} />
          </div>
        </Row>
        <Row label="Letter spacing">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <DimensionInput
              prefix={letterSpacingPrefix}
              ariaLabel="Letter spacing"
              value={letterSpacing}
              onChange={onLetterSpacing}
              options={LETTER_SPACING_OPTIONS}
              snap={{ targets: letterSpacingMatch.snapTargets, threshold: 3 }}
              tokenLabel={letterSpacingTokenLabel}
            />
            <TokenButton property="letter-spacing" onSelect={onLetterSpacingToken} />
          </div>
        </Row>
      </div>

      <Row label="Alignment">
        <SegmentedButtonGroup
          value={hAlign}
          onChange={v => onHAlign(v as HTextAlign)}
          options={[
            { value: 'left', title: 'Align left', icon: textAlignLeft },
            { value: 'center', title: 'Align center', icon: textAlignCenter },
            { value: 'right', title: 'Align right', icon: textAlignRight },
          ]}
        />
        <div style={{ width: 4 }} />
        <SegmentedButtonGroup
          value={vAlign}
          onChange={v => onVAlign(v as VTextAlign)}
          options={[
            { value: 'top', title: 'Align top', icon: textAlignTop },
            { value: 'middle', title: 'Align middle', icon: textAlignMiddle },
            { value: 'bottom', title: 'Align bottom', icon: textAlignBottom },
          ]}
        />
        <div style={{ flex: 1 }} />
        <IconButton title="Type settings">{slidersIcon}</IconButton>
      </Row>
    </Section>
  )
}

const H_TO_JUSTIFY: Record<HTextAlign, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
}

const V_TO_ALIGN: Record<VTextAlign, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
}

const V_TO_VERTICAL_ALIGN: Record<VTextAlign, string> = {
  top: 'top',
  middle: 'middle',
  bottom: 'bottom',
}

function isFlex(el: Element): boolean {
  const display = readRaw(el, 'display')
  return display === 'flex' || display === 'inline-flex'
}

function readHAlign(el: Element): HTextAlign {
  if (isFlex(el)) {
    const jc = readRaw(el, 'justify-content')
    if (jc === 'flex-end' || jc === 'end' || jc === 'right') return 'right'
    if (jc === 'center') return 'center'
    if (jc === 'flex-start' || jc === 'start' || jc === 'left') return 'left'
  }
  const ta = readRaw(el, 'text-align')
  if (ta === 'right' || ta === 'end') return 'right'
  if (ta === 'center') return 'center'
  return 'left'
}

function readVAlign(el: Element): VTextAlign {
  if (isFlex(el)) {
    const ai = readRaw(el, 'align-items')
    if (ai === 'flex-end' || ai === 'end') return 'bottom'
    if (ai === 'center') return 'middle'
    return 'top'
  }
  const va = readRaw(el, 'vertical-align')
  if (va === 'bottom') return 'bottom'
  if (va === 'middle') return 'middle'
  return 'top'
}

const lineHeightPrefix = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <text x="6" y="7.5" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontFamily="serif" fontWeight="600">A</text>
    <line x1="2.5" y1="10" x2="9.5" y2="10" />
  </svg>
)

const letterSpacingPrefix = (
  <svg viewBox="0 0 14 12" width="14" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <line x1="1.5" y1="2" x2="1.5" y2="10" />
    <line x1="12.5" y1="2" x2="12.5" y2="10" />
    <text x="7" y="9" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontFamily="serif" fontWeight="600">A</text>
  </svg>
)

const textAlignLeft = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="3.5" width="10" height="1.5" rx="0.5" />
    <rect x="2" y="7.25" width="12" height="1.5" rx="0.5" />
    <rect x="2" y="11" width="8" height="1.5" rx="0.5" />
  </svg>
)
const textAlignCenter = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="3" y="3.5" width="10" height="1.5" rx="0.5" />
    <rect x="2" y="7.25" width="12" height="1.5" rx="0.5" />
    <rect x="4" y="11" width="8" height="1.5" rx="0.5" />
  </svg>
)
const textAlignRight = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="4" y="3.5" width="10" height="1.5" rx="0.5" />
    <rect x="2" y="7.25" width="12" height="1.5" rx="0.5" />
    <rect x="6" y="11" width="8" height="1.5" rx="0.5" />
  </svg>
)

const textAlignTop = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="2" width="12" height="1.25" rx="0.4" />
    <rect x="4.5" y="4.5" width="1.5" height="8" rx="0.4" />
    <rect x="7" y="4.5" width="1.5" height="8" rx="0.4" />
    <rect x="9.5" y="4.5" width="1.5" height="8" rx="0.4" />
  </svg>
)
const textAlignMiddle = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="7.4" width="12" height="1.25" rx="0.4" />
    <rect x="4.5" y="3.5" width="1.5" height="9" rx="0.4" />
    <rect x="7" y="3.5" width="1.5" height="9" rx="0.4" />
    <rect x="9.5" y="3.5" width="1.5" height="9" rx="0.4" />
  </svg>
)
const textAlignBottom = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="12.75" width="12" height="1.25" rx="0.4" />
    <rect x="4.5" y="3.5" width="1.5" height="8" rx="0.4" />
    <rect x="7" y="3.5" width="1.5" height="8" rx="0.4" />
    <rect x="9.5" y="3.5" width="1.5" height="8" rx="0.4" />
  </svg>
)
