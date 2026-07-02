import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Token } from '../pixel-common'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Row } from './Row'
import { Section } from './Section'
import { TokenButton } from './TokenButton'
import {
  cornersIcon,
  dropletIcon,
  eyeIcon,
  eyeOffIcon,
  opacityIcon,
  radiusBLIcon,
  radiusBRIcon,
  radiusTLIcon,
  radiusTRIcon,
  zIndexIcon,
} from './icons'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { tokenDisplayLabel } from './token-mapping'
import { COLORS, SIZES } from './tokens'
import { useScrubbable, type ScrubExtras } from './useScrubbable'
import { useTokenMatch } from './useTokenMatch'
import { readOpacity, readPx, readRaw } from '../edit/read-computed'

export interface AppearanceSectionProps {
  elements?: Element[]
}

type CornerKey = 'tl' | 'tr' | 'bl' | 'br'

/** Per-corner radius longhands + their prefix glyphs. Listed in 2×2 visual
 *  order (top row, then bottom row) so the grid below reads as on canvas. */
const RADIUS_CORNERS: { key: CornerKey; property: string; icon: ReactNode; label: string }[] = [
  { key: 'tl', property: 'border-top-left-radius',     icon: radiusTLIcon, label: 'Top-left radius' },
  { key: 'tr', property: 'border-top-right-radius',    icon: radiusTRIcon, label: 'Top-right radius' },
  { key: 'bl', property: 'border-bottom-left-radius',  icon: radiusBLIcon, label: 'Bottom-left radius' },
  { key: 'br', property: 'border-bottom-right-radius', icon: radiusBRIcon, label: 'Bottom-right radius' },
]

type Shared = 'single' | 'multiple'

export function AppearanceSection({ elements = [] }: AppearanceSectionProps = {}) {
  const [opacity, setOpacity] = useState('100')
  const [opacityShared, setOpacityShared] = useState<Shared>('single')
  const [zIndex, setZIndex] = useState('')
  const [zIndexShared, setZIndexShared] = useState<Shared>('single')
  // Radius is held per-corner; the collapsed "all corners" input is derived
  // (uniform value when the four agree, blank "Mixed" otherwise).
  const [corners, setCorners] = useState<Record<CornerKey, string>>({ tl: '0', tr: '0', bl: '0', br: '0' })
  const [cornersShared, setCornersShared] = useState<Record<CornerKey, Shared>>({
    tl: 'single', tr: 'single', bl: 'single', br: 'single',
  })
  const [radiusExpanded, setRadiusExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (elements.length === 0) {
      setOpacity('100'); setIsVisible(true); setOpacityShared('single')
      setZIndex(''); setZIndexShared('single')
      setCorners({ tl: '0', tr: '0', bl: '0', br: '0' })
      setCornersShared({ tl: 'single', tr: 'single', bl: 'single', br: 'single' })
      return
    }
    const op = readShared(elements, readOpacity)
    if (op.kind === 'multiple') { setOpacity(''); setOpacityShared('multiple') }
    else                        { setOpacity(op.kind === 'single' ? op.value : '100'); setOpacityShared('single') }

    // `z-index: auto` (the default) reads as an empty input — only an explicit
    // numeric layer shows a value.
    const zi = readShared(elements, el => { const v = readRaw(el, 'z-index'); return v === 'auto' ? '' : v })
    if (zi.kind === 'multiple') { setZIndex(''); setZIndexShared('multiple') }
    else                        { setZIndex(zi.kind === 'single' ? zi.value : ''); setZIndexShared('single') }

    const nextCorners = {} as Record<CornerKey, string>
    const nextShared = {} as Record<CornerKey, Shared>
    for (const { key, property } of RADIUS_CORNERS) {
      const r = readShared(elements, el => readPx(el, property))
      if (r.kind === 'multiple') { nextCorners[key] = ''; nextShared[key] = 'multiple' }
      else                       { nextCorners[key] = (r.kind === 'single' ? r.value : '') || '0'; nextShared[key] = 'single' }
    }
    setCorners(nextCorners); setCornersShared(nextShared)

    const vis = readShared(elements, el => readRaw(el, 'visibility') || 'visible')
    setIsVisible(vis.kind !== 'single' ? true : vis.value !== 'hidden')
  }, [elements])

  function onToggleVisible() {
    const next = !isVisible
    setIsVisible(next)
    // Hidden → inline `visibility: hidden`. Visible → clear the inline override
    // so the element falls back to its CSS / inherited value (default `visible`).
    applyPatchAll(elements, { kind: 'setStyle', property: 'visibility', value: next ? '' : 'hidden' })
  }

  function onOpacity(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setOpacity(v); setOpacityShared('single')
    // Snap-to-token (scrub) and typed-value auto-bind both route to a token
    // patch when the value coincides with one; otherwise raw. Mirrors radius.
    if (extras?.snappedToken) {
      applyTokenAll(elements, 'opacity', extras.snappedToken)
      return
    }
    const typed = matchOpacityToken(v)
    if (typed) {
      applyTokenAll(elements, 'opacity', typed)
      return
    }
    const n = parseFloat(v)
    const css = Number.isFinite(n) ? String(Math.max(0, Math.min(100, n)) / 100) : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'opacity', value: css })
  }
  function onOpacityToken(token: Token) {
    applyTokenAll(elements, 'opacity', token)
    setOpacityShared('single')
    // Opacity tokens resolve to a 0–1 fraction (or a `%`); the input shows 0–100.
    const m = /^(-?[\d.]+)\s*(%?)/.exec(token.value.trim())
    if (m) setOpacity(String(Math.round(parseFloat(m[1]) * (m[2] === '%' ? 1 : 100))))
  }

  /** Shared radius write: snap-to-token / typed-value bind → token patch,
   *  otherwise a raw px patch. `property` is the shorthand `border-radius` for
   *  the all-corners input, or a corner longhand for the per-corner inputs. */
  function writeRadius(property: string, v: string, extras?: ScrubExtras) {
    if (extras?.snappedToken) {
      applyTokenAll(elements, property, extras.snappedToken)
      return
    }
    const typed = radiusMatch.matchToken(v ? `${v}px` : '')
    if (typed) {
      applyTokenAll(elements, property, typed)
      return
    }
    applyPatchAll(elements, { kind: 'setStyle', property, value: v ? `${v}px` : '' })
  }

  function onAllCorners(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setCorners({ tl: v, tr: v, bl: v, br: v })
    setCornersShared({ tl: 'single', tr: 'single', bl: 'single', br: 'single' })
    writeRadius('border-radius', v, extras)
  }
  function onCorner(key: CornerKey, property: string) {
    return (v: string, _mods?: unknown, extras?: ScrubExtras) => {
      setCorners(prev => ({ ...prev, [key]: v }))
      setCornersShared(prev => ({ ...prev, [key]: 'single' }))
      writeRadius(property, v, extras)
    }
  }
  function onRadiusToken(token: Token) {
    applyTokenAll(elements, 'border-radius', token)
    // Optimistic local-state sync; tries to extract a numeric for the px-only
    // input. Non-px tokens (rem, var(), 999px etc.) show whatever leading
    // number they have — close enough until the read effect re-runs.
    const m = /^(-?[\d.]+)/.exec(token.value.trim())
    const v = m ? m[1] : ''
    setCorners({ tl: v, tr: v, bl: v, br: v })
    setCornersShared({ tl: 'single', tr: 'single', bl: 'single', br: 'single' })
  }

  // Opacity tokens store a 0–1 fraction; this input works in 0–100. Bridge the
  // two by scaling snap targets into percent space, then match there (the
  // generic 0.5 tolerance is px-oriented — far too loose in 0–1 space).
  const opacityMatch = useTokenMatch('opacity')
  const opacitySnapTargets = useMemo(
    () => opacityMatch.snapTargets.map(t => ({ numericValue: t.numericValue * 100, token: t.token })),
    [opacityMatch.snapTargets],
  )
  function matchOpacityToken(pct: string): Token | null {
    const n = parseFloat(pct)
    if (!Number.isFinite(n)) return null
    for (const { numericValue, token } of opacitySnapTargets) {
      if (Math.abs(numericValue - n) < 0.5) return token
    }
    return null
  }
  const opacityTokenLabel = opacityShared === 'single' ? tokenDisplayLabel(matchOpacityToken(opacity)) : null
  const scrubOpacity = useScrubbable({
    value: opacity,
    onChange: onOpacity,
    min: 0,
    max: 100,
    snap: { targets: opacitySnapTargets, threshold: 3 },
  })

  const zIndexMatch = useTokenMatch('z-index')
  function onZIndex(v: string, _mods?: unknown, extras?: ScrubExtras) {
    setZIndex(v); setZIndexShared('single')
    // Snap-to-token (scrub) and typed-value auto-bind route to a token patch
    // when the value coincides with a z-index token; otherwise a raw integer.
    if (extras?.snappedToken) {
      applyTokenAll(elements, 'z-index', extras.snappedToken)
      return
    }
    const typed = zIndexMatch.matchToken(v)
    if (typed) {
      applyTokenAll(elements, 'z-index', typed)
      return
    }
    // z-index is an integer; empty clears the inline override (back to `auto`).
    const n = parseInt(v, 10)
    const css = Number.isFinite(n) ? String(n) : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'z-index', value: css })
  }
  function onZIndexToken(token: Token) {
    applyTokenAll(elements, 'z-index', token)
    setZIndexShared('single')
    const m = /^(-?\d+)/.exec(token.value.trim())
    if (m) setZIndex(m[1])
  }
  const zIndexTokenLabel = zIndexShared === 'single' ? tokenDisplayLabel(zIndexMatch.matchToken(zIndex)) : null
  const scrubZIndex = useScrubbable({
    value: zIndex,
    onChange: onZIndex,
    min: 0,
    snap: zIndexMatch.snapTargets.length > 0 ? { targets: zIndexMatch.snapTargets, threshold: 1 } : undefined,
  })

  const radiusMatch = useTokenMatch('border-radius')
  // Collapse the four corners to the all-corners control: a uniform value when
  // they all agree, blank "Mixed" otherwise (editing it still sets all four).
  const allCornersSingle = RADIUS_CORNERS.every(c => cornersShared[c.key] === 'single')
  const uniformRadius = allCornersSingle && RADIUS_CORNERS.every(c => corners[c.key] === corners.tl)
  const allValue = uniformRadius ? corners.tl : ''
  const allTokenLabel = uniformRadius ? tokenDisplayLabel(radiusMatch.matchToken(allValue ? `${allValue}px` : '')) : null

  const actions = (
    <>
      <IconButton
        title={isVisible ? 'Hide' : 'Show'}
        isActive={isVisible}
        onClick={onToggleVisible}
      >
        {isVisible ? eyeIcon : eyeOffIcon}
      </IconButton>
      <IconButton title="Blend mode">{dropletIcon}</IconButton>
    </>
  )

  return (
    <Section title="Appearance" actions={actions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Row label="Opacity">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <NumericInput
              prefix={opacityIcon}
              suffix={opacityShared === 'multiple' ? '' : '%'}
              ariaLabel="Opacity"
              value={opacity}
              placeholder={opacityShared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
              disabled={opacityShared === 'multiple'}
              onChange={onOpacity}
              prefixProps={scrubOpacity.prefixProps}
              tokenLabel={opacityTokenLabel}
            />
            <TokenButton property="opacity" onSelect={onOpacityToken} />
          </div>
        </Row>

        <Row label="Z-index">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <NumericInput
              prefix={zIndexIcon}
              ariaLabel="Z-index"
              value={zIndex}
              placeholder={zIndexShared === 'multiple' ? MULTIPLE_PLACEHOLDER : 'auto'}
              disabled={zIndexShared === 'multiple'}
              onChange={onZIndex}
              prefixProps={scrubZIndex.prefixProps}
              tokenLabel={zIndexTokenLabel}
            />
            <TokenButton property="z-index" onSelect={onZIndexToken} />
          </div>
        </Row>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, color: COLORS.label, letterSpacing: '0.01em' }}>
            Corner radius
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SIZES.rowGap, minWidth: 0 }}>
            <RadiusInput
              icon={cornerRadiusPrefix}
              ariaLabel="Corner radius (all)"
              value={allValue}
              placeholder={uniformRadius ? '' : 'Mixed'}
              onChange={onAllCorners}
              snapTargets={radiusMatch.snapTargets}
              tokenLabel={allTokenLabel}
            />
            <TokenButton property="border-radius" onSelect={onRadiusToken} />
            <IconButton
              title={radiusExpanded ? 'Collapse corners' : 'Independent corners'}
              isActive={radiusExpanded}
              onClick={() => setRadiusExpanded(v => !v)}
            >
              {cornersIcon}
            </IconButton>
          </div>

          {radiusExpanded && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                // Align the grid with the all-corners input above, leaving room
                // for the trailing token + expand buttons (2 × iconButton + gaps).
                paddingRight: SIZES.iconButton * 2 + SIZES.rowGap * 2,
              }}
            >
              {RADIUS_CORNERS.map(c => (
                <RadiusInput
                  key={c.key}
                  icon={c.icon}
                  ariaLabel={c.label}
                  value={corners[c.key]}
                  placeholder={cornersShared[c.key] === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
                  disabled={cornersShared[c.key] === 'multiple'}
                  onChange={onCorner(c.key, c.property)}
                  snapTargets={radiusMatch.snapTargets}
                  tokenLabel={
                    cornersShared[c.key] === 'single'
                      ? tokenDisplayLabel(radiusMatch.matchToken(corners[c.key] ? `${corners[c.key]}px` : ''))
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

/** A radius numeric input wired to its own scrubber + token snapping. Kept as a
 *  child so each of the (up to five) radius inputs gets its own `useScrubbable`
 *  without a hook-in-a-loop. */
function RadiusInput({
  icon,
  ariaLabel,
  value,
  placeholder = '',
  disabled = false,
  onChange,
  snapTargets,
  tokenLabel,
}: {
  icon: ReactNode
  ariaLabel: string
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string, mods?: unknown, extras?: ScrubExtras) => void
  snapTargets: ReturnType<typeof useTokenMatch>['snapTargets']
  tokenLabel: string | null
}) {
  const scrub = useScrubbable({
    value,
    onChange,
    min: 0,
    snap: snapTargets.length > 0 ? { targets: snapTargets, threshold: 3 } : undefined,
  })
  return (
    <NumericInput
      prefix={icon}
      ariaLabel={ariaLabel}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={onChange}
      prefixProps={scrub.prefixProps}
      tokenLabel={tokenLabel}
    />
  )
}

const cornerRadiusPrefix = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <path d="M 2 11 V 5 A 3 3 0 0 1 5 2 H 11" />
  </svg>
)
