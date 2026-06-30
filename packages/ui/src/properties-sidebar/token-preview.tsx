/**
 * Kind-specific token previews + clamp helpers, shared between the Design
 * System page and the in-sidebar TokenPickerPopover.
 *
 * Each preview is sized for a 48×36 slot in a row layout. The clamps prevent a
 * pathological token value (`--shadow-glow: 0 0 9999px ...`) from blowing out
 * the row.
 */
import type { CSSProperties } from 'react'
import type { Token } from '../pixel-common'
import { COLORS, FONTS, FONT_SIZE, RADIUS } from '../design-system'

export function renderTokenPreview(token: Token) {
  switch (token.kind) {
    case 'color':
      return (
        <div
          style={{
            width: 32,
            height: 32,
            background: token.value,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sm,
          }}
        />
      )
    case 'radius':
      return (
        <div
          style={{
            width: 32,
            height: 32,
            background: COLORS.accentDim,
            borderRadius: clampRadius(token.value),
          }}
        />
      )
    case 'shadow':
      return (
        <div
          style={{
            width: 40,
            height: 24,
            background: COLORS.bgElevated,
            borderRadius: RADIUS.sm,
            boxShadow: token.value,
            border: `1px solid ${COLORS.borderSubtle}`,
          }}
        />
      )
    case 'font-size':
      return (
        <div
          style={{
            fontFamily: FONTS.ui,
            fontSize: clampFontSize(token.value),
            color: COLORS.textPrimary,
            lineHeight: 1,
          }}
        >
          Ag
        </div>
      )
    case 'font-family':
      return (
        <div
          style={{
            fontFamily: token.value,
            fontSize: FONT_SIZE.lg,
            color: COLORS.textPrimary,
            lineHeight: 1,
          }}
        >
          Aa
        </div>
      )
    case 'font-weight':
      return (
        <div
          style={{
            fontFamily: FONTS.ui,
            fontSize: FONT_SIZE.lg,
            fontWeight: token.value as CSSProperties['fontWeight'],
            color: COLORS.textPrimary,
            lineHeight: 1,
          }}
        >
          Aa
        </div>
      )
    case 'line-height':
      return (
        <div
          style={{
            fontFamily: FONTS.ui,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textPrimary,
            lineHeight: token.value,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>Aa</span>
          <span>Bb</span>
        </div>
      )
    case 'letter-spacing':
      return (
        <div
          style={{
            fontFamily: FONTS.ui,
            fontSize: FONT_SIZE.lg,
            letterSpacing: token.value,
            color: COLORS.textPrimary,
            lineHeight: 1,
          }}
        >
          AB
        </div>
      )
    case 'spacing':
      return (
        <div
          style={{
            width: clampLengthPx(token.value, 40),
            height: 8,
            background: COLORS.accentDim,
            borderRadius: 2,
          }}
        />
      )
    case 'border-width':
      return (
        <div
          style={{
            width: 24,
            height: 24,
            background: 'transparent',
            border: `${clampLengthPx(token.value, 8)}px solid ${COLORS.accent}`,
            borderRadius: RADIUS.sm,
          }}
        />
      )
    case 'opacity':
      // Accent square at the token's alpha over a checkerboard, so a low value
      // reads as "see-through" rather than just "dim".
      return (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: RADIUS.sm,
            border: `1px solid ${COLORS.border}`,
            backgroundImage:
              'repeating-conic-gradient(#9aa0aa 0% 25%, #d7dbe0 0% 50%)',
            backgroundSize: '10px 10px',
            overflow: 'hidden',
          }}
        >
          <div style={{ width: '100%', height: '100%', background: COLORS.accent, opacity: clampOpacity(token.value) }} />
        </div>
      )
    default:
      return null
  }
}

/** Parse a CSS length to pixels. Returns null for non-px values (rem/em/%, var(),
 *  named keywords) since the token's value is what we display, not what we
 *  measure against. */
export function parsePx(value: string): number | null {
  const trimmed = value.trim()
  const m = /^(-?[\d.]+)\s*px$/.exec(trimmed)
  if (m) return parseFloat(m[1])
  // Bare numbers are also treated as px so MUI's `shape.borderRadius: 8`
  // works without a unit.
  const n = parseFloat(trimmed)
  if (!Number.isNaN(n) && /^[\d.-]+$/.test(trimmed)) return n
  return null
}

function clampRadius(value: string): string {
  const px = parsePx(value)
  if (px != null) return `${Math.min(px, 16)}px`
  return value
}

function clampFontSize(value: string): string {
  const px = parsePx(value)
  if (px != null) return `${Math.min(Math.max(px, 10), 20)}px`
  if (/rem|em/.test(value)) return value
  return '14px'
}

/** Resolve an opacity token value (`0.6`, `60%`) to a 0–1 number for preview. */
function clampOpacity(value: string): number {
  const t = value.trim()
  const pct = /^(-?[\d.]+)\s*%$/.exec(t)
  const n = pct ? parseFloat(pct[1]) / 100 : parseFloat(t)
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(n, 0), 1)
}

function clampLengthPx(value: string, max: number): number {
  const px = parsePx(value)
  if (px == null) return 1
  return Math.min(Math.max(Math.abs(px), 1), max)
}
