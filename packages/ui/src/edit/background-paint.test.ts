import { describe, expect, it } from 'vitest'
import {
  gradientToCss,
  paintsToStyles,
  paintToStyles,
  parseGradient,
  splitTopLevel,
  type BackgroundPaint,
  type GradientPaint,
  type GradientStop,
} from './background-paint'

/** Drop the editor-only `id` so parse output can be compared structurally. */
const bare = (s: GradientStop) => ({ hex: s.hex, alpha: s.alpha, position: s.position })

describe('splitTopLevel', () => {
  it('splits on top-level commas, ignoring commas inside parens', () => {
    expect(splitTopLevel('90deg, rgb(1, 2, 3) 0%, rgba(4, 5, 6, 0.5) 100%')).toEqual([
      '90deg',
      'rgb(1, 2, 3) 0%',
      'rgba(4, 5, 6, 0.5) 100%',
    ])
  })
})

describe('parseGradient — linear', () => {
  it('parses an explicit angle + rgb stops with positions', () => {
    const g = parseGradient('linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)')!
    expect(g.type).toBe('linear')
    expect(g.angle).toBe('90')
    expect(g.stops.map(bare)).toEqual([
      { hex: 'FF0000', alpha: '100', position: '0' },
      { hex: '0000FF', alpha: '100', position: '100' },
    ])
  })

  it('defaults the angle to 180 and distributes missing positions (Chrome computed form)', () => {
    // Chrome drops the default 180deg and omits 0%/100% positions.
    const g = parseGradient('linear-gradient(rgb(137, 90, 246), rgb(124, 59, 231))')!
    expect(g.angle).toBe('180')
    expect(g.stops.map((s) => s.position)).toEqual(['0', '100'])
    expect(g.stops[0].hex).toBe('895AF6')
    expect(g.stops[1].hex).toBe('7C3BE7')
  })

  it('maps `to right` side syntax to 90deg and keeps alpha', () => {
    const g = parseGradient('linear-gradient(to right, rgba(0, 0, 0, 0.5) 0%, rgb(255,255,255) 50%)')!
    expect(g.angle).toBe('90')
    expect(bare(g.stops[0])).toEqual({ hex: '000000', alpha: '50', position: '0' })
    expect(g.stops[1].position).toBe('50')
  })

  it('evenly distributes three position-less stops', () => {
    const g = parseGradient('linear-gradient(rgb(1,1,1), rgb(2,2,2), rgb(3,3,3))')!
    expect(g.stops.map((s) => s.position)).toEqual(['0', '50', '100'])
  })
})

describe('parseGradient — radial', () => {
  it('parses radial stops and skips a leading shape clause', () => {
    const g = parseGradient('radial-gradient(circle at center, rgb(255,0,0) 0%, rgb(0,255,0) 100%)')!
    expect(g.type).toBe('radial')
    expect(g.stops.map((s) => s.hex)).toEqual(['FF0000', '00FF00'])
  })

  it('parses radial without a shape clause', () => {
    const g = parseGradient('radial-gradient(rgb(255,0,0), rgb(0,0,255))')!
    expect(g.type).toBe('radial')
    expect(g.stops).toHaveLength(2)
  })
})

describe('parseGradient — non-gradient', () => {
  it('returns null for url() / none', () => {
    expect(parseGradient('url("x.png")')).toBeNull()
    expect(parseGradient('none')).toBeNull()
  })
})

describe('gradientToCss', () => {
  it('round-trips linear with angle + rgba stops', () => {
    const g: GradientPaint = {
      kind: 'gradient',
      type: 'linear',
      angle: '45',
      stops: [
        { hex: 'FF0000', alpha: '100', position: '0' },
        { hex: '0000FF', alpha: '50', position: '100' },
      ],
    }
    expect(gradientToCss(g)).toBe('linear-gradient(45deg, rgba(255, 0, 0, 1) 0%, rgba(0, 0, 255, 0.5) 100%)')
  })

  it('emits stops in ascending position order regardless of array order', () => {
    const g: GradientPaint = {
      kind: 'gradient',
      type: 'linear',
      angle: '0',
      stops: [
        { hex: '0000FF', alpha: '100', position: '100' },
        { hex: 'FF0000', alpha: '100', position: '0' },
        { hex: '00FF00', alpha: '100', position: '50' },
      ],
    }
    expect(gradientToCss(g)).toBe(
      'linear-gradient(0deg, rgba(255, 0, 0, 1) 0%, rgba(0, 255, 0, 1) 50%, rgba(0, 0, 255, 1) 100%)',
    )
  })

  it('emits radial-gradient (no angle)', () => {
    const g: GradientPaint = {
      kind: 'gradient',
      type: 'radial',
      angle: '180',
      stops: [
        { hex: 'FFFFFF', alpha: '100', position: '0' },
        { hex: '000000', alpha: '100', position: '100' },
      ],
    }
    expect(gradientToCss(g)).toBe('radial-gradient(rgba(255, 255, 255, 1) 0%, rgba(0, 0, 0, 1) 100%)')
  })
})

describe('paintToStyles', () => {
  it('solid clears background-image and sets background-color', () => {
    expect(paintToStyles({ kind: 'solid', hex: '112233', alpha: '80' })).toEqual([
      { property: 'background-image', value: '' },
      { property: 'background-color', value: 'rgba(17, 34, 51, 0.8)' },
    ])
  })

  it('image sets url + size/position/repeat and clears background-color', () => {
    const styles = paintToStyles({
      kind: 'image',
      url: 'https://x/y.png',
      size: 'contain',
      position: 'top left',
      repeat: 'repeat-x',
    })
    expect(styles).toEqual([
      { property: 'background-color', value: '' },
      { property: 'background-image', value: 'url("https://x/y.png")' },
      { property: 'background-size', value: 'contain' },
      { property: 'background-position', value: 'top left' },
      { property: 'background-repeat', value: 'repeat-x' },
    ])
  })

  it('gradient sets background-image and clears background-color', () => {
    // (kept below)
    expect(true).toBe(true)
  })
})

describe('paintsToStyles — layered', () => {
  const grad: GradientPaint = {
    kind: 'gradient', type: 'linear', angle: '90',
    stops: [{ hex: 'FF0000', alpha: '100', position: '0' }, { hex: '0000FF', alpha: '100', position: '100' }],
  }
  const img: BackgroundPaint = { kind: 'image', url: 'x.png', size: 'cover', position: 'center', repeat: 'no-repeat' }
  const solid: BackgroundPaint = { kind: 'solid', hex: '112233', alpha: '100' }

  it('clears everything for an empty / all-transparent stack', () => {
    expect(paintsToStyles([{ kind: 'solid', hex: '', alpha: '0' }])).toEqual([
      { property: 'background-image', value: '' },
      { property: 'background-size', value: '' },
      { property: 'background-position', value: '' },
      { property: 'background-repeat', value: '' },
      { property: 'background-color', value: '' },
    ])
  })

  it('a lone solid is a plain background-color', () => {
    expect(paintsToStyles([solid])).toEqual([
      { property: 'background-image', value: '' },
      { property: 'background-color', value: 'rgba(17, 34, 51, 1)' },
    ])
  })

  it('stacks image + gradient over a bottom solid (order = top→bottom)', () => {
    const styles = paintsToStyles([img, grad, solid])
    const map = Object.fromEntries(styles.map(s => [s.property, s.value]))
    expect(map['background-image']).toBe('url("x.png"), linear-gradient(90deg, rgba(255, 0, 0, 1) 0%, rgba(0, 0, 255, 1) 100%)')
    expect(map['background-size']).toBe('cover, auto')
    expect(map['background-position']).toBe('center, 0% 0%')
    expect(map['background-repeat']).toBe('no-repeat, no-repeat')
    expect(map['background-color']).toBe('rgba(17, 34, 51, 1)')
  })

  it('renders a solid above an image as an opaque linear-gradient layer', () => {
    const styles = paintsToStyles([solid, img])
    const map = Object.fromEntries(styles.map(s => [s.property, s.value]))
    expect(map['background-image']).toBe('linear-gradient(rgba(17, 34, 51, 1), rgba(17, 34, 51, 1)), url("x.png")')
    expect(map['background-color']).toBe('')
  })
})

describe('paintToStyles — gradient (single)', () => {
  it('gradient sets background-image and clears background-color', () => {
    const styles = paintToStyles({
      kind: 'gradient',
      type: 'linear',
      angle: '90',
      stops: [
        { hex: 'FF0000', alpha: '100', position: '0' },
        { hex: '00FF00', alpha: '100', position: '100' },
      ],
    })
    expect(styles[0]).toEqual({ property: 'background-color', value: '' })
    expect(styles[1].property).toBe('background-image')
    expect(styles[1].value).toContain('linear-gradient(90deg')
  })
})
