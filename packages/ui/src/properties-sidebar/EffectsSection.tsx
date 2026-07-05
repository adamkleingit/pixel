import { useEffect, useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { DropShadowPopover } from './DropShadowPopover'
import { EffectTypeMenu } from './EffectTypeMenu'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Section } from './Section'
import { TokenButton } from './TokenButton'
import { chevronIcon, eyeIcon, eyeOffIcon, minusIcon, plusIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { applyPatchAll, applyTokenAll, readShared } from './read-shared'
import {
  composeBoxShadow,
  defaultShadow,
  parseBlurRadius,
  parseBoxShadow,
  parseBoxShadows,
  type BoxShadow,
} from '../edit/color'

export interface EffectsSectionProps {
  elements?: Element[]
}

type EffectType = 'Drop shadow' | 'Inner shadow' | 'Layer blur' | 'Background blur'

/** Shadow effects drive `box-shadow` (inner = the `inset` keyword); blur effects
 *  drive `filter` (Layer blur) / `backdrop-filter` (Background blur). */
const SHADOW_TYPES = new Set<EffectType>(['Drop shadow', 'Inner shadow'])
const isShadowType = (t: string): boolean => SHADOW_TYPES.has(t as EffectType)

type Effect = {
  id: string
  type: EffectType
  isVisible: boolean
  /** Used by Drop / Inner shadow. */
  shadow: BoxShadow
  /** Blur radius in px (string) — used by Layer / Background blur. */
  radius: string
}

let nextId = 1
const mkId = () => `effect-${nextId++}`

// Blur radius can't be negative — clamp at 0.
const px = (v: string) => `${Math.max(0, parseFloat(v) || 0)}px`

/** Drop the `blur()` functions from a `filter` / `backdrop-filter` value, keeping
 *  any other functions (e.g. `grayscale()`) so we don't clobber them. */
function stripBlurFns(filter: string): string {
  if (!filter || filter === 'none') return ''
  return filter.replace(/blur\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
}

export function EffectsSection({ elements = [] }: EffectsSectionProps = {}) {
  const [effects, setEffects] = useState<Effect[]>([])
  const [shared, setShared] = useState<'single' | 'multiple'>('single')
  const [previewPopover, setPreviewPopover] = useState<string | null>(null)
  const [typeMenu, setTypeMenu] = useState<string | null>(null)
  const previewAnchorsRef = useRef<Record<string, HTMLElement | null>>({})
  const typeAnchorsRef = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    if (elements.length === 0) { setEffects([]); setShared('single'); return }
    // The section owns three properties; a divergence in any of them across the
    // selection collapses to "Multiple".
    const sig = readShared(elements, el => {
      const cs = getComputedStyle(el)
      return `${cs.boxShadow}||${cs.filter}||${cs.backdropFilter}`
    })
    if (sig.kind === 'multiple') {
      setShared('multiple')
      setEffects([])
      return
    }
    setShared('single')
    const cs = getComputedStyle(elements[0])
    const list: Effect[] = []
    for (const s of parseBoxShadows(cs.boxShadow)) {
      list.push({
        id: mkId(),
        type: s.inset ? 'Inner shadow' : 'Drop shadow',
        isVisible: true,
        shadow: s,
        radius: '4',
      })
    }
    const layer = parseBlurRadius(cs.filter)
    if (layer) list.push({ id: mkId(), type: 'Layer blur', isVisible: true, shadow: defaultShadow(), radius: layer })
    const backdrop = parseBlurRadius(cs.backdropFilter)
    if (backdrop) list.push({ id: mkId(), type: 'Background blur', isVisible: true, shadow: defaultShadow(), radius: backdrop })
    setEffects(list)
  }, [elements])

  function applyToElement(next: Effect[]) {
    // box-shadow ← visible shadow effects (inner ones get the `inset` keyword).
    const shadows = next.filter(e => e.isVisible && isShadowType(e.type))
    const boxShadow = shadows.length
      ? shadows.map(e => composeBoxShadow({ ...e.shadow, inset: e.type === 'Inner shadow' })).join(', ')
      : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'box-shadow', value: boxShadow })

    // filter / backdrop-filter ← visible blur effects, preserving any non-blur
    // functions already present on the element (read from the first selected).
    const el0 = elements[0] as HTMLElement | undefined
    const layerBlurs = next.filter(e => e.isVisible && e.type === 'Layer blur' && e.radius)
    const bgBlurs = next.filter(e => e.isVisible && e.type === 'Background blur' && e.radius)
    const baseFilter = el0 ? stripBlurFns(getComputedStyle(el0).filter) : ''
    const baseBackdrop = el0 ? stripBlurFns(getComputedStyle(el0).backdropFilter) : ''
    const filterVal = [baseFilter, layerBlurs.map(e => `blur(${px(e.radius)})`).join(' ')].filter(Boolean).join(' ')
    const backdropVal = [baseBackdrop, bgBlurs.map(e => `blur(${px(e.radius)})`).join(' ')].filter(Boolean).join(' ')
    applyPatchAll(elements, { kind: 'setStyle', property: 'filter', value: filterVal })
    applyPatchAll(elements, { kind: 'setStyle', property: 'backdrop-filter', value: backdropVal })
  }

  function updateEffect(id: string, patch: Partial<Omit<Effect, 'shadow'>>) {
    setShared('single')
    setEffects(prev => {
      const next = prev.map(e => (e.id === id ? { ...e, ...patch } : e))
      applyToElement(next)
      return next
    })
  }
  function updateShadow(id: string, patch: Partial<BoxShadow>) {
    setShared('single')
    setEffects(prev => {
      const next = prev.map(e => (e.id === id ? { ...e, shadow: { ...e.shadow, ...patch } } : e))
      applyToElement(next)
      return next
    })
  }
  function removeEffect(id: string) {
    setEffects(prev => {
      const next = prev.filter(e => e.id !== id)
      applyToElement(next)
      return next
    })
  }
  function addEffect() {
    setEffects(prev => {
      const next: Effect[] = [...prev, { id: mkId(), type: 'Drop shadow', isVisible: true, shadow: defaultShadow(), radius: '4' }]
      applyToElement(next)
      return next
    })
  }
  function onShadowTokenForRow(id: string, token: Token) {
    // Box-shadow tokens only apply to shadow effects. Apply verbatim so the agent
    // can rewrite to `shadow-<name>` / `var(--shadow-<name>)`.
    applyTokenAll(elements, 'box-shadow', token)
    const parsed = parseBoxShadow(token.value)
    setEffects(prev => prev.map(e =>
      e.id === id && parsed ? { ...e, shadow: parsed, isVisible: true } : e,
    ))
    setShared('single')
  }

  const actions = (
    <IconButton title="Add effect" onClick={addEffect}>{plusIcon}</IconButton>
  )

  const activePreviewAnchor = {
    get current() {
      return previewPopover ? previewAnchorsRef.current[previewPopover] ?? null : null
    },
  }
  const activeTypeAnchor = {
    get current() {
      return typeMenu ? typeAnchorsRef.current[typeMenu] ?? null : null
    },
  }
  const activeTypeValue = typeMenu
    ? effects.find(e => e.id === typeMenu)?.type ?? 'Drop shadow'
    : 'Drop shadow'
  const activeShadow = previewPopover
    ? effects.find(e => e.id === previewPopover)?.shadow ?? defaultShadow()
    : defaultShadow()

  return (
    <Section title="Effects" actions={actions}>
      {shared === 'multiple' && (
        <div style={{ fontSize: 11, color: COLORS.muted, padding: '4px 0' }}>
          Multiple
        </div>
      )}
      {effects.map(effect => {
        const shadow = isShadowType(effect.type)
        return (
          <div
            key={effect.id}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {/* Preview / edit swatch — shadow effects open the editor popover;
                blur effects have nothing to pick a colour for, so it's a static
                blur glyph. */}
            <button
              ref={el => {
                previewAnchorsRef.current[effect.id] = el
              }}
              type="button"
              disabled={!shadow}
              onClick={shadow ? () => setPreviewPopover(prev => (prev === effect.id ? null : effect.id)) : undefined}
              title={shadow ? 'Edit effect' : effect.type}
              style={{
                width: SIZES.rowHeight,
                height: SIZES.rowHeight,
                background: COLORS.input,
                border: `1px solid ${previewPopover === effect.id ? COLORS.accentLight : 'transparent'}`,
                borderRadius: 4,
                cursor: shadow ? 'pointer' : 'default',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                padding: 0,
              }}
            >
              {shadow ? (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: '#fff',
                    boxShadow: !effect.isVisible
                      ? 'none'
                      : effect.type === 'Inner shadow'
                        ? 'inset 0 0 3px 1px rgba(0,0,0,0.5)'
                        : '0 2px 3px rgba(0,0,0,0.35)',
                  }}
                />
              ) : (
                <span style={{ color: COLORS.muted, display: 'inline-flex', opacity: effect.isVisible ? 1 : 0.4 }}>
                  {blurIcon}
                </span>
              )}
            </button>

            <button
              ref={el => {
                typeAnchorsRef.current[effect.id] = el
              }}
              type="button"
              onClick={() =>
                setTypeMenu(prev => (prev === effect.id ? null : effect.id))
              }
              style={{
                flex: 1,
                minWidth: 0,
                height: SIZES.rowHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 8px',
                background: COLORS.input,
                border: 'none',
                borderRadius: 4,
                color: COLORS.text,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span>{effect.type}</span>
              <span style={{ color: COLORS.muted }}>{chevronIcon}</span>
            </button>

            {shadow ? (
              <TokenButton
                property="box-shadow"
                onSelect={t => onShadowTokenForRow(effect.id, t)}
              />
            ) : (
              <div style={{ width: 76, display: 'flex' }}>
                <NumericInput
                  value={effect.radius}
                  onChange={v => updateEffect(effect.id, { radius: v })}
                  suffix="px"
                  ariaLabel="Blur radius"
                  prefix={blurIcon}
                />
              </div>
            )}
            <IconButton
              title={effect.isVisible ? 'Hide' : 'Show'}
              isActive={effect.isVisible}
              onClick={() =>
                updateEffect(effect.id, { isVisible: !effect.isVisible })
              }
            >
              {effect.isVisible ? eyeIcon : eyeOffIcon}
            </IconButton>
            <IconButton title="Remove" onClick={() => removeEffect(effect.id)}>
              {minusIcon}
            </IconButton>
          </div>
        )
      })}

      <DropShadowPopover
        isOpen={previewPopover !== null}
        onClose={() => setPreviewPopover(null)}
        anchorRef={activePreviewAnchor}
        value={activeShadow}
        onChange={patch => { if (previewPopover) updateShadow(previewPopover, patch) }}
      />

      <EffectTypeMenu
        isOpen={typeMenu !== null}
        value={activeTypeValue}
        onChange={v => typeMenu && updateEffect(typeMenu, { type: v as EffectType })}
        onClose={() => setTypeMenu(null)}
        anchorRef={activeTypeAnchor}
      />
    </Section>
  )
}

const blurIcon = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" strokeDasharray="1.5 2" />
    <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
  </svg>
)
