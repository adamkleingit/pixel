/**
 * Color format conversions used by the Design pane color controls.
 *
 * Canonical in-sidebar shape is `{ hex: 'RRGGBB', alphaPercent: '0'..'100' }`.
 * Live DOM values come back from `getComputedStyle` as `rgb(r, g, b)` or
 * `rgba(r, g, b, a)` strings.
 */

// ---------------------------------------------------------------------------
// RGB / hex
// ---------------------------------------------------------------------------

/** Parse `rgb(r, g, b)` or `rgba(r, g, b, a)` into `{ hex, alphaPercent }`. */
export function rgbStringToHexAlpha(input: string): { hex: string; alphaPercent: string } {
  const fallback = { hex: '000000', alphaPercent: '100' }
  if (!input) return fallback
  const trimmed = input.trim()
  if (!trimmed || trimmed === 'transparent') return { hex: '000000', alphaPercent: '0' }
  const m = trimmed.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)/i)
  if (!m) return fallback
  const r = clamp255(parseFloat(m[1]))
  const g = clamp255(parseFloat(m[2]))
  const b = clamp255(parseFloat(m[3]))
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1
  return {
    hex: `${byteHex(r)}${byteHex(g)}${byteHex(b)}`.toUpperCase(),
    alphaPercent: String(Math.round(clamp01(a) * 100)),
  }
}

/** Produce a CSS `rgba(...)` string from hex + percentage alpha. */
export function hexAlphaToRgba(hex: string, alphaPercent: string): string {
  const { r, g, b } = parseHex(hex)
  const a = Math.max(0, Math.min(100, parseFloat(alphaPercent) || 0)) / 100
  return `rgba(${r}, ${g}, ${b}, ${round(a, 3)})`
}

/** Normalize user-typed hex (with/without #, 3/6/8 chars) to 6-char uppercase. */
export function normalizeHex(raw: string): string {
  const s = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return s.split('').map(c => c + c).join('').toUpperCase()
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase()
  if (/^[0-9a-fA-F]{8}$/.test(s)) return s.slice(0, 6).toUpperCase()
  return s.toUpperCase()
}

function parseHex(raw: string): { r: number; g: number; b: number } {
  const s = normalizeHex(raw).padEnd(6, '0').slice(0, 6)
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0,
  }
}

function byteHex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0')
}

// ---------------------------------------------------------------------------
// HSV ↔ hex (for SaturationValuePicker sync)
// ---------------------------------------------------------------------------

/** HSV in domain `h: 0..360, s: 0..1, v: 0..1`. */
export interface HSV { h: number; s: number; v: number }

export function hexToHsv(hex: string): HSV {
  const { r, g, b } = parseHex(hex)
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  const v = max
  const s = max === 0 ? 0 : d / max
  let h = 0
  if (d !== 0) {
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) * 60
    else if (max === G) h = ((B - R) / d + 2) * 60
    else h = ((R - G) / d + 4) * 60
  }
  return { h, s, v }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const H = ((h % 360) + 360) % 360 / 60
  const c = v * s
  const x = c * (1 - Math.abs((H % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (H < 1) { r = c; g = x }
  else if (H < 2) { r = x; g = c }
  else if (H < 3) { g = c; b = x }
  else if (H < 4) { g = x; b = c }
  else if (H < 5) { r = x; b = c }
  else { r = c; b = x }
  return `${byteHex((r + m) * 255)}${byteHex((g + m) * 255)}${byteHex((b + m) * 255)}`.toUpperCase()
}

// ---------------------------------------------------------------------------
// box-shadow parse / compose
// ---------------------------------------------------------------------------

export interface BoxShadow {
  x: string            // px, signed
  y: string
  blur: string
  spread: string
  hex: string
  alphaPercent: string
}

export function defaultShadow(): BoxShadow {
  return { x: '0', y: '4', blur: '4', spread: '0', hex: '000000', alphaPercent: '25' }
}

/** Parse the first shadow layer out of a `box-shadow` CSS string. */
export function parseBoxShadow(raw: string): BoxShadow | null {
  if (!raw || raw === 'none') return null
  const colorMatch = raw.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/)
  if (!colorMatch) return null
  const color = colorMatch[0]
  const rest = raw.replace(color, '').trim()
  const parts = rest.split(/\s+/).filter(Boolean)
  const [x = '0', y = '0', blur = '0', spread = '0'] = parts.map(stripPx)
  const { hex, alphaPercent } = color.startsWith('#')
    ? { hex: normalizeHex(color), alphaPercent: '100' }
    : rgbStringToHexAlpha(color)
  return { x, y, blur, spread, hex, alphaPercent }
}

export function composeBoxShadow(s: BoxShadow): string {
  return `${toPx(s.x)} ${toPx(s.y)} ${toPx(s.blur)} ${toPx(s.spread)} ${hexAlphaToRgba(s.hex, s.alphaPercent)}`
}

function stripPx(s: string): string {
  return s.replace(/px$/, '')
}

function toPx(s: string): string {
  const n = parseFloat(s)
  return Number.isFinite(n) ? `${n}px` : '0px'
}

// ---------------------------------------------------------------------------
// border shorthand
// ---------------------------------------------------------------------------

export interface Border {
  widthPx: string
  style: string        // 'solid' | 'dashed' | 'dotted' | 'none' | …
  hex: string
  alphaPercent: string
}

export function readBorder(el: Element): Border {
  const cs = getComputedStyle(el)
  const w = parseFloat(cs.borderTopWidth) || 0
  const style = (cs.borderTopStyle || 'solid').trim()
  const { hex, alphaPercent } = rgbStringToHexAlpha(cs.borderTopColor)
  return { widthPx: String(Math.round(w)), style, hex, alphaPercent }
}

export function composeBorder(b: Border): string {
  const w = parseFloat(b.widthPx) || 0
  if (w <= 0) return ''
  return `${w}px ${b.style || 'solid'} ${hexAlphaToRgba(b.hex, b.alphaPercent)}`
}

// ---------------------------------------------------------------------------

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)) }
function clamp255(n: number): number { return Math.max(0, Math.min(255, n)) }
function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
