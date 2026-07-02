import { useEffect, useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { FillPopover } from './FillPopover'
import { PaintRow } from './PaintRow'
import { Section } from './Section'
import { TokenButton } from './TokenButton'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { hexAlphaToRgba, normalizeHex, rgbStringToHexAlpha } from '../edit/color'

export interface TextColorSectionProps {
  elements?: Element[]
}

/**
 * Dedicated section for the CSS `color` property. Separate from the Typography
 * section so the designer can tweak the text colour without scrolling through
 * family / weight / size controls.
 */
export function TextColorSection({ elements = [] }: TextColorSectionProps = {}) {
  const [hex, setHex] = useState('000000')
  const [alpha, setAlpha] = useState('100')
  const [isVisible, setIsVisible] = useState(true)
  const [shared, setShared] = useState<'single' | 'multiple'>('single')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (elements.length === 0) return
    const color = readShared(elements, el => getComputedStyle(el).getPropertyValue('color'))
    if (color.kind === 'multiple') {
      setShared('multiple')
      setHex(''); setAlpha('')
      return
    }
    const parsed = rgbStringToHexAlpha(color.kind === 'single' ? color.value : '')
    setHex(parsed.hex)
    setAlpha(parsed.alphaPercent)
    setIsVisible(parsed.alphaPercent !== '0')
    setShared('single')
  }, [elements])

  function apply(nextHex: string, nextAlpha: string, nextVisible: boolean) {
    const value = nextVisible ? hexAlphaToRgba(nextHex, nextAlpha) : ''
    applyPatchAll(elements, { kind: 'setStyle', property: 'color', value })
  }

  function onHex(v: string) {
    const norm = normalizeHex(v)
    setHex(norm); setShared('single')
    apply(norm, alpha || '100', isVisible)
  }
  function onAlpha(v: string) {
    setAlpha(v); setShared('single')
    apply(hex, v, isVisible)
  }
  function onVisibility(v: boolean) {
    setIsVisible(v); setShared('single')
    apply(hex, alpha, v)
  }
  function onColorFromPopover(nextHex: string, nextAlpha: string) {
    const norm = normalizeHex(nextHex)
    setHex(norm)
    setAlpha(nextAlpha)
    setShared('single')
    apply(norm, nextAlpha, isVisible)
  }
  function onColorToken(token: Token) {
    applyTokenAll(elements, 'color', token)
    const parsed = rgbStringToHexAlpha(token.value)
    setHex(parsed.hex)
    setAlpha(parsed.alphaPercent)
    setIsVisible(true)
    setShared('single')
  }

  return (
    <Section
      title="Color"
      actions={<TokenButton property="color" onSelect={onColorToken} title="Use a color token" />}
    >
      <div ref={anchorRef}>
        <PaintRow
          hex={hex}
          hexPlaceholder={shared === 'multiple' ? MULTIPLE_PLACEHOLDER : undefined}
          swatchColor={shared === 'multiple' ? 'transparent' : `#${hex}`}
          swatchBackground={shared === 'multiple' ? 'transparent' : `#${hex}`}
          alpha={alpha}
          isVisible={isVisible}
          disabled={shared === 'multiple'}
          onHexChange={onHex}
          onAlphaChange={onAlpha}
          onVisibilityChange={onVisibility}
          onSwatchClick={() => setPopoverOpen(v => !v)}
        />
      </div>
      <FillPopover
        isOpen={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorRef={anchorRef}
        hex={hex}
        alpha={alpha}
        onChangeColor={onColorFromPopover}
      />
    </Section>
  )
}
