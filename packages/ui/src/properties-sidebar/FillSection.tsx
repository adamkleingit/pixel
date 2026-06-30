import { useEffect, useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { FillPopover } from './FillPopover'
import { IconButton } from './IconButton'
import { PaintRow } from './PaintRow'
import { Section } from './Section'
import { plusIcon } from './icons'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { hexAlphaToRgba, normalizeHex, rgbStringToHexAlpha } from '../edit/color'

export interface FillSectionProps {
  elements?: Element[]
}

type Fill = {
  id: string
  hex: string
  alpha: string
  isVisible: boolean
}

let nextId = 1
const mkId = () => `fill-${nextId++}`

export function FillSection({ elements = [] }: FillSectionProps = {}) {
  const [fills, setFills] = useState<Fill[]>([
    { id: mkId(), hex: '050505', alpha: '100', isVisible: true },
  ])
  const [shared, setShared] = useState<'single' | 'multiple'>('single')
  const [activePopover, setActivePopover] = useState<string | null>(null)
  const anchorsRef = useRef<Record<string, HTMLElement | null>>({})

  // Sync the first fill from the elements' computed background-color whenever
  // selection changes. When multi-edit elements disagree, mark the row as
  // "Multiple" so the designer sees they'd be overwriting different values.
  useEffect(() => {
    if (elements.length === 0) return
    const bg = readShared(elements, el => getComputedStyle(el).getPropertyValue('background-color'))
    if (bg.kind === 'multiple') {
      setShared('multiple')
      setFills([{ id: mkId(), hex: '', alpha: '', isVisible: true }])
      return
    }
    const value = bg.kind === 'single' ? bg.value : ''
    const { hex, alphaPercent } = rgbStringToHexAlpha(value)
    setShared('single')
    setFills([{ id: mkId(), hex, alpha: alphaPercent, isVisible: alphaPercent !== '0' }])
  }, [elements])

  function applyToElement(nextFills: Fill[]) {
    const visible = nextFills.find(f => f.isVisible)
    const value = visible && visible.hex ? hexAlphaToRgba(visible.hex, visible.alpha || '100') : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'background-color', value })
  }

  function updateFill(id: string, patch: Partial<Fill>) {
    setShared('single')
    setFills(prev => {
      const next = prev.map(f => {
        if (f.id !== id) return f
        const merged = { ...f, ...patch }
        if (typeof patch.hex === 'string') merged.hex = normalizeHex(patch.hex)
        return merged
      })
      applyToElement(next)
      return next
    })
  }
  function removeFill(id: string) {
    setFills(prev => {
      const next = prev.filter(f => f.id !== id)
      applyToElement(next)
      return next
    })
    if (activePopover === id) setActivePopover(null)
  }
  function addFill() {
    setFills(prev => {
      const next = [...prev, { id: mkId(), hex: '000000', alpha: '100', isVisible: true }]
      applyToElement(next)
      return next
    })
  }
  function onColorTokenForRow(id: string, token: Token) {
    // Token-bound write — the token's resolved value is the CSS color (hex /
    // rgba / oklch / hsl); applyTokenAll carries the source payload so the
    // agent rewrites source to the symbolic spelling. Only updates *this* row's
    // displayed hex/alpha; other rows are unchanged.
    applyTokenAll(elements, 'background-color', token)
    setShared('single')
    const parsed = rgbStringToHexAlpha(token.value)
    setFills(prev => prev.map(f =>
      f.id === id ? { ...f, hex: parsed.hex, alpha: parsed.alphaPercent, isVisible: true } : f,
    ))
  }

  const actions = (
    <IconButton title="Add fill" onClick={addFill}>{plusIcon}</IconButton>
  )

  const activeAnchorRef = {
    get current() {
      return activePopover ? anchorsRef.current[activePopover] ?? null : null
    },
  }
  const activeFill = activePopover ? fills.find(f => f.id === activePopover) ?? null : null

  return (
    <Section title="Fill" actions={actions}>
      {fills.map(fill => (
        <div
          key={fill.id}
          ref={el => {
            anchorsRef.current[fill.id] = el
          }}
        >
          <PaintRow
            hex={fill.hex}
            hexPlaceholder={shared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
            swatchColor={shared === 'multiple' ? 'transparent' : `#${fill.hex}`}
            swatchBackground={shared === 'multiple' ? 'transparent' : `#${fill.hex}`}
            alpha={fill.alpha}
            alphaPlaceholder={shared === 'multiple' ? '–' : ''}
            isVisible={fill.isVisible}
            disabled={shared === 'multiple'}
            onHexChange={v => updateFill(fill.id, { hex: v })}
            onAlphaChange={v => updateFill(fill.id, { alpha: v })}
            onVisibilityChange={v => updateFill(fill.id, { isVisible: v })}
            onSwatchClick={() =>
              setActivePopover(prev => (prev === fill.id ? null : fill.id))
            }
            onRemove={() => removeFill(fill.id)}
            tokenProperty="background-color"
            onTokenSelect={t => onColorTokenForRow(fill.id, t)}
          />
        </div>
      ))}

      <FillPopover
        isOpen={activePopover !== null}
        onClose={() => setActivePopover(null)}
        anchorRef={activeAnchorRef}
        hex={activeFill?.hex ?? '000000'}
        alpha={activeFill?.alpha ?? '100'}
        onChangeColor={(hex, alpha) => {
          if (activePopover) updateFill(activePopover, { hex, alpha })
        }}
      />
    </Section>
  )
}
