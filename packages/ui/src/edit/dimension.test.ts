import { describe, expect, it } from 'vitest'
import { composeDimension, isLengthUnit, parseDimension, unitOptions } from './dimension'

describe('parseDimension', () => {
  it('splits a number and its unit', () => {
    expect(parseDimension('12px')).toEqual({ num: '12', unit: 'px' })
    expect(parseDimension('1.5em')).toEqual({ num: '1.5', unit: 'em' })
    expect(parseDimension('50%')).toEqual({ num: '50', unit: '%' })
    expect(parseDimension('-4px')).toEqual({ num: '-4', unit: 'px' })
  })

  it('treats a bare number as unitless (e.g. line-height: 2)', () => {
    expect(parseDimension('2')).toEqual({ num: '2', unit: '' })
    expect(parseDimension('1.4')).toEqual({ num: '1.4', unit: '' })
  })

  it('recognizes keywords', () => {
    expect(parseDimension('auto')).toEqual({ num: '', unit: 'auto' })
    expect(parseDimension('normal')).toEqual({ num: '', unit: 'normal' })
  })

  it('keeps opaque values (calc/var) verbatim', () => {
    expect(parseDimension('calc(100% - 8px)')).toEqual({ num: '', unit: 'calc(100% - 8px)' })
    expect(parseDimension('')).toEqual({ num: '', unit: '' })
  })
})

describe('composeDimension', () => {
  it('attaches a length unit to the number', () => {
    expect(composeDimension('12', 'px')).toBe('12px')
    expect(composeDimension('1.5', 'em')).toBe('1.5em')
    expect(composeDimension('50', '%')).toBe('50%')
  })

  it('emits a bare number for unitless', () => {
    expect(composeDimension('2', '')).toBe('2')
  })

  it('emits the keyword alone', () => {
    expect(composeDimension('12', 'auto')).toBe('auto')
    expect(composeDimension('', 'normal')).toBe('normal')
  })

  it('clears (empty) when the number is empty and unit is a length', () => {
    expect(composeDimension('', 'px')).toBe('')
    expect(composeDimension('', '')).toBe('')
  })
})

describe('isLengthUnit', () => {
  it('true for length units + unitless, false for keywords', () => {
    expect(isLengthUnit('')).toBe(true)
    expect(isLengthUnit('px')).toBe(true)
    expect(isLengthUnit('em')).toBe(true)
    expect(isLengthUnit('auto')).toBe(false)
    expect(isLengthUnit('normal')).toBe(false)
  })
})

describe('unitOptions', () => {
  it('builds options with unitless + keywords', () => {
    expect(unitOptions({ lengths: ['px', 'em', '%'], unitless: true, keywords: ['normal'] })).toEqual([
      { value: '', label: '—' },
      { value: 'px', label: 'px' },
      { value: 'em', label: 'em' },
      { value: '%', label: '%' },
      { value: 'normal', label: 'normal' },
    ])
  })
})
