/**
 * Background paint model — a structured, editable representation of an element's
 * background, plus parse (from computed style) and serialize (to CSS) helpers.
 *
 * The design pane's Background section reads an element into a `BackgroundPaint`,
 * lets the user edit it, and writes it back as inline styles. Three kinds:
 *   - **solid**    → `background-color`
 *   - **gradient** → `background-image: linear|radial-gradient(...)`
 *   - **image**    → `background-image: url(...)` + size / position / repeat
 *
 * Colors are carried as `{ hex, alpha }` (hex = 6 upper-case chars, alpha =
 * 0..100 string) to match the rest of the paint UI; serialization emits `rgba()`.
 */

import { hexAlphaToRgba, rgbStringToHexAlpha } from './color'

export interface GradientStop {
  /** Stable editor identity — lets the UI track a stop across position sorting
   *  and drag-reordering. Ignored by serialization. */
  id?: string
  /** 6-char upper-case hex, no `#`. */
  hex: string
  /** 0..100 string. */
  alpha: string
  /** 0..100 string — the stop's position along the gradient. */
  position: string
}

let stopSeq = 0
/** Fresh stable id for a gradient stop (editor identity only). */
export function newStopId(): string {
  return `gs${++stopSeq}`
}

export type GradientType = 'linear' | 'radial'

export interface SolidPaint {
  kind: 'solid'
  hex: string
  alpha: string
}

export interface GradientPaint {
  kind: 'gradient'
  type: GradientType
  /** Angle in degrees (0..360) as a string. Linear only; ignored for radial. */
  angle: string
  stops: GradientStop[]
}

export interface ImagePaint {
  kind: 'image'
  /** The image URL (unquoted). */
  url: string
  /** `background-size`: `auto` | `cover` | `contain` | `<len/%> [<len/%>]`. */
  size: string
  /** `background-position`: e.g. `center`, `50% 50%`, `10px 20px`. */
  position: string
  /** `background-repeat`: `repeat` | `no-repeat` | `repeat-x` | `repeat-y` | `space` | `round`. */
  repeat: string
}

export type BackgroundPaint = SolidPaint | GradientPaint | ImagePaint

// ---------------------------------------------------------------------------
// Defaults / factories
// ---------------------------------------------------------------------------

export function defaultSolid(hex = '000000', alpha = '100'): SolidPaint {
  return { kind: 'solid', hex, alpha }
}

export function defaultGradient(): GradientPaint {
  return {
    kind: 'gradient',
    type: 'linear',
    angle: '180',
    stops: [
      { id: newStopId(), hex: 'FFFFFF', alpha: '100', position: '0' },
      { id: newStopId(), hex: '000000', alpha: '100', position: '100' },
    ],
  }
}

export function defaultImage(): ImagePaint {
  return { kind: 'image', url: '', size: 'cover', position: 'center', repeat: 'no-repeat' }
}

// ---------------------------------------------------------------------------
// Parse — computed style → BackgroundPaint
// ---------------------------------------------------------------------------

/** Read an element's background into a paint. `background-image` wins over
 *  `background-color` (a gradient-backed element's color is usually the initial
 *  transparent black). */
export function readPaint(el: Element): BackgroundPaint {
  const cs = getComputedStyle(el)
  const image = (cs.backgroundImage || '').trim()
  if (image && image !== 'none') {
    if (/gradient\(/i.test(image)) {
      const g = parseGradient(image)
      if (g) return g
    }
    const url = extractUrl(image)
    if (url !== null) {
      return {
        kind: 'image',
        url,
        size: (cs.backgroundSize || 'auto').trim(),
        position: (cs.backgroundPosition || '0% 0%').trim(),
        repeat: normalizeRepeat(cs.backgroundRepeat || 'repeat'),
      }
    }
  }
  const { hex, alphaPercent } = rgbStringToHexAlpha(cs.backgroundColor)
  return { kind: 'solid', hex, alpha: alphaPercent }
}

/** Pull the URL out of a computed `url("…")` (possibly layered — first wins). */
function extractUrl(image: string): string | null {
  const m = image.match(/url\((['"]?)(.*?)\1\)/i)
  return m ? m[2] : null
}

/** Collapse a computed two-keyword repeat (`repeat repeat`) to its shorthand. */
function normalizeRepeat(value: string): string {
  const v = value.trim()
  if (v === 'repeat repeat') return 'repeat'
  if (v === 'no-repeat no-repeat') return 'no-repeat'
  if (v === 'repeat no-repeat') return 'repeat-x'
  if (v === 'no-repeat repeat') return 'repeat-y'
  if (v === 'space space') return 'space'
  if (v === 'round round') return 'round'
  return v
}

/** Split on top-level commas, ignoring commas inside `(...)`. */
export function splitTopLevel(input: string, sep = ','): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === sep && depth === 0) {
      out.push(input.slice(start, i))
      start = i + 1
    }
  }
  out.push(input.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

const SIDE_ANGLE: Record<string, string> = {
  'to top': '0',
  'to right': '90',
  'to bottom': '180',
  'to left': '270',
  'to top right': '45',
  'to right top': '45',
  'to bottom right': '135',
  'to right bottom': '135',
  'to bottom left': '225',
  'to left bottom': '225',
  'to top left': '315',
  'to left top': '315',
}

/** Parse a computed `linear-gradient(...)` / `radial-gradient(...)`. Returns
 *  null when the value isn't a simple (non-repeating) gradient we can model. */
export function parseGradient(image: string): GradientPaint | null {
  const m = image.match(/^(linear|radial)-gradient\((.*)\)$/is)
  if (!m) return null
  const type = m[1].toLowerCase() as GradientType
  const parts = splitTopLevel(m[2])
  if (parts.length === 0) return null

  let angle = '180'
  let stopParts = parts
  const first = parts[0].toLowerCase()
  if (type === 'linear') {
    const deg = first.match(/^(-?[\d.]+)deg$/)
    if (deg) {
      angle = String(((parseFloat(deg[1]) % 360) + 360) % 360)
      stopParts = parts.slice(1)
    } else if (first in SIDE_ANGLE) {
      angle = SIDE_ANGLE[first]
      stopParts = parts.slice(1)
    }
  } else {
    // radial: an optional shape/size/position clause precedes the stops. It
    // never contains a color, so treat a leading part with no color as config.
    if (!hasColor(parts[0])) stopParts = parts.slice(1)
  }

  const stops: GradientStop[] = []
  stopParts.forEach((part, i) => {
    const parsed = parseStop(part)
    if (parsed) {
      // Fill missing positions by even distribution across the stop count.
      if (parsed.position === null) {
        parsed.position = stopParts.length <= 1 ? 0 : Math.round((i / (stopParts.length - 1)) * 100)
      }
      stops.push({ id: newStopId(), hex: parsed.hex, alpha: parsed.alpha, position: String(parsed.position) })
    }
  })
  if (stops.length === 0) return null
  return { kind: 'gradient', type, angle, stops }
}

function hasColor(part: string): boolean {
  return /rgba?\(|hsla?\(|#[0-9a-f]/i.test(part)
}

/** Parse one `<color> [<pos>%]` stop. Computed colors are rgb/rgba. */
function parseStop(part: string): { hex: string; alpha: string; position: number | null } | null {
  const trimmed = part.trim()
  // Color = an rgb()/rgba()/hsl() call or a #hex, at the start.
  const colorMatch = trimmed.match(/^(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8})/)
  if (!colorMatch) return null
  const color = colorMatch[0]
  const rest = trimmed.slice(color.length).trim()
  const posMatch = rest.match(/(-?[\d.]+)%/)
  const position = posMatch ? Math.max(0, Math.min(100, parseFloat(posMatch[1]))) : null
  const { hex, alphaPercent } = color.startsWith('#')
    ? hexToHexAlpha(color)
    : rgbStringToHexAlpha(color)
  return { hex, alpha: alphaPercent, position }
}

function hexToHexAlpha(hex: string): { hex: string; alphaPercent: string } {
  const s = hex.replace(/^#/, '')
  if (s.length === 8) {
    const a = parseInt(s.slice(6, 8), 16) / 255
    return { hex: s.slice(0, 6).toUpperCase(), alphaPercent: String(Math.round(a * 100)) }
  }
  if (s.length === 3) {
    return { hex: s.split('').map((c) => c + c).join('').toUpperCase(), alphaPercent: '100' }
  }
  return { hex: s.slice(0, 6).toUpperCase(), alphaPercent: '100' }
}

// ---------------------------------------------------------------------------
// Serialize — BackgroundPaint → CSS
// ---------------------------------------------------------------------------

function stopCss(s: GradientStop): string {
  return `${hexAlphaToRgba(s.hex, s.alpha)} ${s.position}%`
}

/** The `background-image` value for a paint (`none` for solid). Stops are
 *  emitted in ascending position order so the gradient always renders correctly
 *  regardless of the editor's array order. */
export function gradientToCss(paint: GradientPaint): string {
  const stops = sortedStops(paint.stops).map(stopCss).join(', ')
  if (paint.type === 'radial') return `radial-gradient(${stops})`
  return `linear-gradient(${paint.angle}deg, ${stops})`
}

/** Stops sorted by position (ascending), stable for equal positions. */
export function sortedStops(stops: GradientStop[]): GradientStop[] {
  return stops
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (Number(a.s.position) - Number(b.s.position)) || (a.i - b.i))
    .map((x) => x.s)
}

/** The set of inline style writes that realize `paint`. Properties not relevant
 *  to a kind are cleared (empty string → `removeProperty`) so switching kinds
 *  doesn't leave stale layers behind. */
export function paintToStyles(paint: BackgroundPaint): Array<{ property: string; value: string }> {
  switch (paint.kind) {
    case 'solid':
      return [
        { property: 'background-image', value: '' },
        { property: 'background-color', value: paint.hex ? hexAlphaToRgba(paint.hex, paint.alpha) : '' },
      ]
    case 'gradient':
      return [
        { property: 'background-color', value: '' },
        { property: 'background-image', value: gradientToCss(paint) },
      ]
    case 'image':
      return [
        { property: 'background-color', value: '' },
        { property: 'background-image', value: paint.url ? `url("${paint.url}")` : '' },
        { property: 'background-size', value: paint.size },
        { property: 'background-position', value: paint.position },
        { property: 'background-repeat', value: paint.repeat },
      ]
  }
}

/** A CSS value suitable for a small preview swatch (`background:` shorthand). */
export function paintToPreview(paint: BackgroundPaint): string {
  if (paint.kind === 'solid') return hexAlphaToRgba(paint.hex, paint.alpha)
  if (paint.kind === 'gradient') return gradientToCss(paint)
  return paint.url ? `center / cover no-repeat url("${paint.url}")` : 'transparent'
}

// ---------------------------------------------------------------------------
// Layered backgrounds — an ordered stack of paints (order matters). CSS layers
// gradient/image paints via comma-separated background-image (first = topmost),
// with aligned size/position/repeat lists; the single background-color paints
// beneath them all. A solid above an image is realized as an opaque
// linear-gradient layer.
// ---------------------------------------------------------------------------

const BG_PROPS = ['background-image', 'background-size', 'background-position', 'background-repeat', 'background-color']

function isEmptyPaint(p: BackgroundPaint): boolean {
  if (p.kind === 'solid') return !p.hex || p.alpha === '0'
  if (p.kind === 'image') return !p.url
  return false
}

/** Read an element's background as an ordered stack (top → bottom). */
export function readPaints(el: Element): BackgroundPaint[] {
  const cs = getComputedStyle(el)
  const images = splitTopLevel(cs.backgroundImage || 'none')
  const sizes = splitTopLevel(cs.backgroundSize || 'auto')
  const positions = splitTopLevel(cs.backgroundPosition || '0% 0%')
  const repeats = splitTopLevel(cs.backgroundRepeat || 'repeat')
  const layers: BackgroundPaint[] = []
  images.forEach((img, i) => {
    if (!img || img === 'none') return
    if (/gradient\(/i.test(img)) {
      const g = parseGradient(img)
      if (g) layers.push(g)
    } else {
      const url = extractUrl(img)
      if (url !== null) {
        layers.push({
          kind: 'image',
          url,
          size: (sizes[i] || 'auto').trim(),
          position: (positions[i] || '0% 0%').trim(),
          repeat: normalizeRepeat(repeats[i] || 'repeat'),
        })
      }
    }
  })
  const { hex, alphaPercent } = rgbStringToHexAlpha(cs.backgroundColor)
  if (alphaPercent !== '0') layers.push({ kind: 'solid', hex, alpha: alphaPercent })
  if (layers.length === 0) layers.push({ kind: 'solid', hex: '', alpha: '0' })
  return layers
}

function clearBackgroundStyles(): Array<{ property: string; value: string }> {
  return BG_PROPS.map((property) => ({ property, value: '' }))
}

/** Serialize an ordered stack (top → bottom) to inline style writes. */
export function paintsToStyles(paints: BackgroundPaint[]): Array<{ property: string; value: string }> {
  const layers = paints.filter((p) => !isEmptyPaint(p))
  if (layers.length === 0) return clearBackgroundStyles()
  // A lone solid is a plain background-color (cleanest source).
  if (layers.length === 1 && layers[0].kind === 'solid') return paintToStyles(layers[0])

  // A bottom-most solid becomes background-color; the rest become image layers.
  let color = ''
  let imageLayers = layers
  const last = layers[layers.length - 1]
  if (last.kind === 'solid') {
    color = hexAlphaToRgba(last.hex, last.alpha)
    imageLayers = layers.slice(0, -1)
  }

  const imgs: string[] = []
  const sizes: string[] = []
  const positions: string[] = []
  const repeats: string[] = []
  for (const p of imageLayers) {
    if (p.kind === 'gradient') {
      imgs.push(gradientToCss(p)); sizes.push('auto'); positions.push('0% 0%'); repeats.push('no-repeat')
    } else if (p.kind === 'image') {
      imgs.push(`url("${p.url}")`); sizes.push(p.size || 'auto'); positions.push(p.position || '0% 0%'); repeats.push(p.repeat || 'repeat')
    } else {
      const c = hexAlphaToRgba(p.hex, p.alpha)
      imgs.push(`linear-gradient(${c}, ${c})`); sizes.push('auto'); positions.push('0% 0%'); repeats.push('no-repeat')
    }
  }

  return [
    { property: 'background-image', value: imgs.length ? imgs.join(', ') : '' },
    { property: 'background-size', value: imgs.length ? sizes.join(', ') : '' },
    { property: 'background-position', value: imgs.length ? positions.join(', ') : '' },
    { property: 'background-repeat', value: imgs.length ? repeats.join(', ') : '' },
    { property: 'background-color', value: color },
  ]
}

/** Stable equality signature for multi-select comparison. */
export function paintsSignature(paints: BackgroundPaint[]): string {
  return paintsToStyles(paints).map((s) => `${s.property}:${s.value}`).join(';')
}
