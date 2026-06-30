import { useState } from 'react'
import { Row } from './Row'
import { Section } from './Section'
import { COLORS, SIZES } from './tokens'

export interface SourceSectionProps {}

export function SourceSection({}: SourceSectionProps = {}) {
  const [src, setSrc] = useState('')

  return (
    <Section title="Source">
      <Row label="URL">
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
            value={src}
            onChange={e => setSrc(e.target.value)}
            placeholder="https://…"
            aria-label="Source URL"
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
