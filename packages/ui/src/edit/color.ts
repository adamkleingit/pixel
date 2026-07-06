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

/**
 * Parse *any* CSS color string into `{ hex, alphaPercent }` for the sidebar's
 * swatch state. Handles `rgb()/rgba()`, `hsl()/hsla()` (all shadcn design tokens
 * are HSL, e.g. `hsl(262 83% 58%)`), `#hex`, and — via a hidden probe element —
 * anything else the browser understands (named colors, `oklch()`, `color()`).
 * Returns opaque black only when the value is genuinely unparseable.
 *
 * Getting this right matters beyond display: several sections re-apply the color
 * *from this swatch state* (e.g. Stroke re-composes the `border` shorthand), so a
 * bad parse would rewrite the color to black on the next edit.
 */
export function rgbStringToHexAlpha(input: string): { hex: string; alphaPercent: string } {
  const fallback = { hex: '000000', alphaPercent: '100' }
  if (!input) return fallback
  const trimmed = input.trim()
  if (!trimmed || trimmed === 'transparent') return { hex: '000000', alphaPercent: '0' }

  const rgb = trimmed.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)/i)
  if (rgb) {
    return {
      hex: `${byteHex(clamp255(parseFloat(rgb[1])))}${byteHex(clamp255(parseFloat(rgb[2])))}${byteHex(clamp255(parseFloat(rgb[3])))}`.toUpperCase(),
      alphaPercent: String(Math.round(clamp01(rgb[4] !== undefined ? parseFloat(rgb[4]) : 1) * 100)),
    }
  }

  const hsl = parseHsl(trimmed)
  if (hsl) {
    return {
      hex: `${byteHex(hsl.r)}${byteHex(hsl.g)}${byteHex(hsl.b)}`.toUpperCase(),
      alphaPercent: String(Math.round(clamp01(hsl.a) * 100)),
    }
  }

  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return { hex: normalizeHex(trimmed), alphaPercent: '100' }
  }

  // Last resort: let the browser resolve it (named colors, oklch, color(), …)
  // to an rgb() string, then re-parse. No-op outside a DOM (SSR / some tests).
  const resolved = resolveViaDom(trimmed)
  if (resolved && resolved !== trimmed) return rgbStringToHexAlpha(resolved)

  return fallback
}

/** Parse `hsl(h s% l%)` / `hsl(h, s%, l%, a)` (space- or comma-separated, with an
 *  optional alpha) into 0–255 rgb + 0–1 alpha. Pure JS so it works in tests. */
function parseHsl(input: string): { r: number; g: number; b: number; a: number } | null {
  const m = input.match(
    /hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)/i,
  )
  if (!m) return null
  const h = parseFloat(m[1])
  const s = clamp01(parseFloat(m[2]) / 100)
  const l = clamp01(parseFloat(m[3]) / 100)
  let a = 1
  if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x }
  else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x }
  else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c }
  else { r = c; b = x }
  const mm = l - c / 2
  return { r: (r + mm) * 255, g: (g + mm) * 255, b: (b + mm) * 255, a }
}

/** Resolve an arbitrary CSS color to an `rgb(...)` string via a hidden probe.
 *  Returns null when there's no DOM or the browser rejected the value. */
function resolveViaDom(input: string): string | null {
  if (typeof document === 'undefined' || !document.body) return null
  try {
    const probe = document.createElement('span')
    probe.style.color = input
    if (!probe.style.color) return null // browser rejected the value
    probe.style.cssText += ';position:absolute;visibility:hidden;pointer-events:none'
    document.body.appendChild(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved && /^rgb/i.test(resolved) ? resolved : null
  } catch {
    return null
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
  /** `inset` shadow (an Inner shadow effect) rather than an outset drop shadow. */
  inset?: boolean
}

export function defaultShadow(): BoxShadow {
  return { x: '0', y: '4', blur: '4', spread: '0', hex: '000000', alphaPercent: '25' }
}

/**
 * Split a comma-separated CSS list (e.g. `box-shadow`) into its top-level
 * layers, respecting the commas inside `rgba(...)` / `hsl(...)` functions.
 */
export function splitCssList(raw: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Parse the first shadow layer out of a `box-shadow` CSS string. */
export function parseBoxShadow(raw: string): BoxShadow | null {
  if (!raw || raw === 'none') return null
  const layer = splitCssList(raw)[0] ?? raw
  return parseShadowLayer(layer)
}

/** Parse every layer of a `box-shadow` CSS string, in order. */
export function parseBoxShadows(raw: string): BoxShadow[] {
  if (!raw || raw === 'none') return []
  return splitCssList(raw)
    .map(parseShadowLayer)
    .filter((s): s is BoxShadow => s !== null)
}

/** Parse a single `box-shadow` layer (no top-level commas). */
function parseShadowLayer(layer: string): BoxShadow | null {
  if (!layer) return null
  const inset = /\binset\b/.test(layer)
  const body = layer.replace(/\binset\b/, '').trim()
  const colorMatch = body.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/)
  if (!colorMatch) return null
  const color = colorMatch[0]
  const rest = body.replace(color, '').trim()
  const parts = rest.split(/\s+/).filter(Boolean)
  const [x = '0', y = '0', blur = '0', spread = '0'] = parts.map(stripPx)
  const { hex, alphaPercent } = color.startsWith('#')
    ? { hex: normalizeHex(color), alphaPercent: '100' }
    : rgbStringToHexAlpha(color)
  return { x, y, blur, spread, hex, alphaPercent, inset }
}

export function composeBoxShadow(s: BoxShadow): string {
  const core = `${toPx(s.x)} ${toPx(s.y)} ${toPx(s.blur)} ${toPx(s.spread)} ${hexAlphaToRgba(s.hex, s.alphaPercent)}`
  return s.inset ? `inset ${core}` : core
}

/** Extract the first `blur(<len>)` radius (px) from a `filter` /
 *  `backdrop-filter` value, or null if there is none. */
export function parseBlurRadius(raw: string): string | null {
  if (!raw || raw === 'none') return null
  const m = raw.match(/blur\(\s*([\d.]+)px\s*\)/)
  return m ? m[1] : null
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
