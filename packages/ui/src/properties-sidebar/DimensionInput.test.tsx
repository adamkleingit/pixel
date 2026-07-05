import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DimensionInput } from './DimensionInput'
import { LETTER_SPACING_OPTIONS, LINE_HEIGHT_OPTIONS } from '../edit/dimension'

afterEach(cleanup)

describe('DimensionInput — px default when there is no numeric length', () => {
  it('keeps a keyword value (normal) editable and defaults typed numbers to px', () => {
    const onChange = vi.fn()
    render(
      <DimensionInput
        ariaLabel="Letter spacing"
        value="normal"
        options={LETTER_SPACING_OPTIONS}
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('Letter spacing') as HTMLInputElement
    expect(input.disabled).toBe(false) // no longer disabled for a keyword
    fireEvent.change(input, { target: { value: '3' } })
    expect(onChange).toHaveBeenCalledWith('3px', undefined, undefined)
  })

  it('defaults an empty value to px', () => {
    const onChange = vi.fn()
    render(
      <DimensionInput
        ariaLabel="Letter spacing"
        value=""
        options={LETTER_SPACING_OPTIONS}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Letter spacing'), { target: { value: '5' } })
    expect(onChange).toHaveBeenCalledWith('5px', undefined, undefined)
  })

  it('keeps a present unitless number unitless (line-height 1.5 → 2, not 2px)', () => {
    const onChange = vi.fn()
    render(
      <DimensionInput
        ariaLabel="Line height"
        value="1.5"
        options={LINE_HEIGHT_OPTIONS}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('Line height'), { target: { value: '2' } })
    expect(onChange).toHaveBeenCalledWith('2', undefined, undefined)
  })
})
