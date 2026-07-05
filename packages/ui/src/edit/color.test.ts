import { describe, expect, it } from 'vitest'
import { rgbStringToHexAlpha } from './color'

describe('rgbStringToHexAlpha', () => {
  it('parses rgb() and rgba()', () => {
    expect(rgbStringToHexAlpha('rgb(255, 0, 0)')).toEqual({ hex: 'FF0000', alphaPercent: '100' })
    expect(rgbStringToHexAlpha('rgba(0, 128, 255, 0.5)')).toEqual({ hex: '0080FF', alphaPercent: '50' })
  })

  it('parses hsl() — the format every shadcn design token uses', () => {
    // hsl(0 0% 100%) = white, hsl(0 0% 0%) = black
    expect(rgbStringToHexAlpha('hsl(0 0% 100%)')).toEqual({ hex: 'FFFFFF', alphaPercent: '100' })
    expect(rgbStringToHexAlpha('hsl(0 0% 0%)')).toEqual({ hex: '000000', alphaPercent: '100' })
    // hsl(262 83% 58%) ≈ #7C3AED (the example's --primary). Was returning 000000.
    expect(rgbStringToHexAlpha('hsl(262 83% 58%)').hex).toBe('7C3BED')
  })

  it('parses comma-separated hsla() with alpha', () => {
    const { hex, alphaPercent } = rgbStringToHexAlpha('hsla(120, 100%, 50%, 0.25)')
    expect(hex).toBe('00FF00')
    expect(alphaPercent).toBe('25')
  })

  it('parses #hex', () => {
    expect(rgbStringToHexAlpha('#7c3aed')).toEqual({ hex: '7C3AED', alphaPercent: '100' })
  })

  it('handles transparent and empty', () => {
    expect(rgbStringToHexAlpha('transparent')).toEqual({ hex: '000000', alphaPercent: '0' })
    expect(rgbStringToHexAlpha('')).toEqual({ hex: '000000', alphaPercent: '100' })
  })
})
