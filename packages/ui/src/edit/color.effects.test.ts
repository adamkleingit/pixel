import { describe, expect, it } from 'vitest'
import { composeBoxShadow, parseBoxShadows, parseBlurRadius, splitCssList } from './color'

describe('shadow/blur parsing for the Effects section', () => {
  it('composes an inset (inner) shadow with the inset keyword', () => {
    expect(composeBoxShadow({ x: '0', y: '4', blur: '4', spread: '0', hex: '000000', alphaPercent: '25', inset: true }))
      .toBe('inset 0px 4px 4px 0px rgba(0, 0, 0, 0.25)')
    expect(composeBoxShadow({ x: '0', y: '4', blur: '4', spread: '0', hex: '000000', alphaPercent: '25' }))
      .toBe('0px 4px 4px 0px rgba(0, 0, 0, 0.25)')
  })

  it('splits a multi-layer box-shadow, respecting rgba() commas', () => {
    const raw = 'rgba(0, 0, 0, 0.25) 0px 4px 4px 0px, rgba(255, 0, 0, 0.5) 0px 0px 2px 1px inset'
    expect(splitCssList(raw)).toHaveLength(2)
    const shadows = parseBoxShadows(raw)
    expect(shadows).toHaveLength(2)
    expect(shadows[0].inset).toBe(false)
    expect(shadows[1].inset).toBe(true)
  })

  it('extracts a blur radius from filter / backdrop-filter', () => {
    expect(parseBlurRadius('blur(8px)')).toBe('8')
    expect(parseBlurRadius('grayscale(1) blur(4.5px)')).toBe('4.5')
    expect(parseBlurRadius('none')).toBeNull()
    expect(parseBlurRadius('')).toBeNull()
  })
})
