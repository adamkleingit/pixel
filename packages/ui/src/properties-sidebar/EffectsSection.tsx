import { useEffect, useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { DropShadowPopover } from './DropShadowPopover'
import { EffectTypeMenu } from './EffectTypeMenu'
import { IconButton } from './IconButton'
import { Section } from './Section'
import { TokenButton } from './TokenButton'
import { chevronIcon, eyeIcon, eyeOffIcon, minusIcon, plusIcon } from './icons'
import { COLORS, SIZES } from './tokens'
import { applyPatchAll, applyTokenAll, readShared } from './read-shared'
import { composeBoxShadow, defaultShadow, parseBoxShadow, type BoxShadow } from '../edit/color'

export interface EffectsSectionProps {
  elements?: Element[]
}

type Effect = {
  id: string
  type: string
  isVisible: boolean
  shadow: BoxShadow
}

let nextId = 1
const mkId = () => `effect-${nextId++}`

export function EffectsSection({ elements = [] }: EffectsSectionProps = {}) {
  const [effects, setEffects] = useState<Effect[]>([])
  const [shared, setShared] = useState<'single' | 'multiple'>('single')
  const [previewPopover, setPreviewPopover] = useState<string | null>(null)
  const [typeMenu, setTypeMenu] = useState<string | null>(null)
  const previewAnchorsRef = useRef<Record<string, HTMLElement | null>>({})
  const typeAnchorsRef = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    if (elements.length === 0) { setEffects([]); setShared('single'); return }
    const sig = readShared(elements, el => getComputedStyle(el).getPropertyValue('box-shadow'))
    if (sig.kind === 'multiple') {
      setShared('multiple')
      setEffects([])
      return
    }
    setShared('single')
    const raw = sig.kind === 'single' ? sig.value : ''
    const parsed = parseBoxShadow(raw)
    setEffects(parsed
      ? [{ id: mkId(), type: 'Drop shadow', isVisible: true, shadow: parsed }]
      : []
    )
  }, [elements])

  function applyToElement(nextEffects: Effect[]) {
    const visible = nextEffects.filter(e => e.isVisible && e.type === 'Drop shadow')
    const value = visible.length ? visible.map(e => composeBoxShadow(e.shadow)).join(', ') : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'box-shadow', value })
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
      const next = [...prev, { id: mkId(), type: 'Drop shadow', isVisible: true, shadow: defaultShadow() }]
      applyToElement(next)
      return next
    })
  }
  function onShadowTokenForRow(id: string, token: Token) {
    // Apply the token verbatim as box-shadow — multi-shadow strings, complex
    // rgba(), oklch(), all valid. The agent rewrites source to `shadow-<name>`
    // (Tailwind) or `var(--shadow-<name>)` based on token.usage. Only this row
    // updates its display values.
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
      {effects.map(effect => (
        <div
          key={effect.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <button
            ref={el => {
              previewAnchorsRef.current[effect.id] = el
            }}
            type="button"
            onClick={() =>
              setPreviewPopover(prev => (prev === effect.id ? null : effect.id))
            }
            title="Edit effect"
            style={{
              width: SIZES.rowHeight,
              height: SIZES.rowHeight,
              background: COLORS.input,
              border: `1px solid ${previewPopover === effect.id ? COLORS.accentLight : 'transparent'}`,
              borderRadius: 4,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: '#fff',
                boxShadow: effect.isVisible
                  ? '0 2px 3px rgba(0,0,0,0.35)'
                  : 'none',
              }}
            />
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

          <TokenButton
            property="box-shadow"
            onSelect={t => onShadowTokenForRow(effect.id, t)}
          />
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
      ))}

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
        onChange={v => typeMenu && updateEffect(typeMenu, { type: v })}
        onClose={() => setTypeMenu(null)}
        anchorRef={activeTypeAnchor}
      />
    </Section>
  )
}
