import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NumericInput } from './NumericInput'

afterEach(cleanup)

describe('NumericInput — value stays visible in tight layouts', () => {
  it('shows the numeric value beside a token label when space is constrained', () => {
    render(
      <div style={{ width: 80 }}>
        <NumericInput value="12" tokenLabel="rounded" ariaLabel="Radius" />
      </div>,
    )
    const input = screen.getByLabelText('Radius') as HTMLInputElement
    expect(input.value).toBe('12')
    // Value group must not shrink — input keeps a content-based minWidth.
    expect(input.style.minWidth).toMatch(/ch/)
  })
})
