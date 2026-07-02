/**
 * Helpers for reading a single CSS property off a live DOM element, parsing
 * the resolved computed-style string into the form the Design pane expects.
 *
 * Kept minimal on purpose — the sections' numeric inputs expect bare numbers
 * (no "px", no "%"), so we strip units here. The values are round-tripped
 * through applyPatch, which re-adds the appropriate unit.
 */

/** Returns the numeric pixel value as a string (e.g. "353"), or "" if absent. */
export function readPx(el: Element, property: string): string {
  const raw = getComputedStyle(el).getPropertyValue(property).trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) ? String(Math.round(n)) : ''
}

/** Returns the unitless numeric value as a string (e.g. "0.5" → "50" for opacity). */
export function readOpacity(el: Element): string {
  const raw = getComputedStyle(el).getPropertyValue('opacity').trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) ? String(Math.round(n * 100)) : '100'
}

/** Reads CSS rotation in degrees out of a `transform: matrix(...)`. */
export function readRotationDeg(el: Element): string {
  const raw = getComputedStyle(el).getPropertyValue('transform').trim()
  if (!raw || raw === 'none') return '0'
  const match = raw.match(/matrix\(([^)]+)\)/)
  if (!match) return '0'
  const [a, b] = match[1].split(',').map(s => parseFloat(s.trim()))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '0'
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  return String(Math.round(deg))
}

/** Reads the raw CSS string, trimmed. */
export function readRaw(el: Element, property: string): string {
  return getComputedStyle(el).getPropertyValue(property).trim()
}

/**
 * Resolve a numeric CSS font-weight (e.g. "400", "700") into the named weight
 * the Typography dropdown uses.
 */
export function readFontWeightName(el: Element): string {
  const raw = getComputedStyle(el).getPropertyValue('font-weight').trim()
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) return 'Regular'
  if (n <= 150) return 'Thin'
  if (n <= 350) return 'Light'
  if (n <= 450) return 'Regular'
  if (n <= 550) return 'Medium'
  if (n <= 650) return 'Semibold'
  if (n <= 800) return 'Bold'
  return 'Black'
}

/** Map the Typography dropdown's named weight back to its numeric value. */
export const FONT_WEIGHT_VALUES: Record<string, string> = {
  Thin: '100',
  Light: '300',
  Regular: '400',
  Medium: '500',
  Semibold: '600',
  Bold: '700',
  Black: '900',
}

/** Pull the first family out of a comma-separated font-family string. */
export function readFontFamilyFirst(el: Element): string {
  const raw = getComputedStyle(el).getPropertyValue('font-family').trim()
  const first = raw.split(',')[0] ?? ''
  return first.replace(/^["']|["']$/g, '').trim()
}
