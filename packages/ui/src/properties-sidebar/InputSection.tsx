import { useEffect, useState } from 'react'
import { Row } from './Row'
import { Section } from './Section'
import { applyPatchAll, MULTIPLE_PLACEHOLDER, readShared, sharedDisplayValue } from './read-shared'
import { COLORS, SIZES } from './tokens'

/**
 * InputSection — placeholder editor for `<input>` / `<textarea>` selections.
 *
 * Reads/writes the `placeholder` attribute via `setAttr`, fanning out across
 * every selected element when multi-edit is on. Visibility is gated upstream
 * by `section-visibility.ts` (only shown for `input` category tags).
 */

export interface InputSectionProps {
  elements?: Element[]
}

export function InputSection({ elements = [] }: InputSectionProps = {}) {
  const [placeholder, setPlaceholder] = useState('')
  const [shared, setShared] = useState<'single' | 'multiple'>('single')

  // The `input` tag-category bucket includes form-control containers like
  // `<form>` and `<select>` that don't have a placeholder. Skip the section
  // when none of the selected elements actually accept one.
  const supportsPlaceholder = elements.some(
    el => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement,
  )

  useEffect(() => {
    if (!supportsPlaceholder) {
      setPlaceholder(''); setShared('single'); return
    }
    const v = readShared(elements, el => el.getAttribute('placeholder') ?? '')
    setPlaceholder(sharedDisplayValue(v))
    setShared(v.kind === 'multiple' ? 'multiple' : 'single')
  }, [elements, supportsPlaceholder])

  if (!supportsPlaceholder) return null

  function onChange(next: string) {
    setPlaceholder(next); setShared('single')
    applyPatchAll(elements, {
      kind: 'setAttr',
      name: 'placeholder',
      value: next === '' ? null : next,
    })
  }

  return (
    <Section title="Input">
      <Row label="Placeholder">
        <label
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            height: SIZES.rowHeight,
            padding: '0 8px',
            background: COLORS.input,
            borderRadius: 4,
            color: COLORS.text,
            fontSize: 12,
            cursor: 'text',
          }}
        >
          <input
            type="text"
            value={placeholder}
            onChange={e => onChange(e.target.value)}
            placeholder={shared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
            disabled={shared === 'multiple'}
            aria-label="Placeholder"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: COLORS.text,
              fontSize: 12,
              padding: 0,
              fontFamily: 'inherit',
            }}
          />
        </label>
      </Row>
    </Section>
  )
}
