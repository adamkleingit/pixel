/**
 * Hook layer for snap-to-token + typed-value auto-bind on continuous numeric
 * properties. One call gets you:
 *   - snap targets for `useScrubbable({ snap })`
 *   - a `matchToken(value)` to detect when a current/typed value coincides
 *     with a token (for label display + auto-bind on commit)
 *
 * The kind→numeric extraction is unit-aware enough for the common cases:
 *   - bare numbers / px → just the number
 *   - rem → multiplied by 16 (the CSS root default; close enough for snap
 *     comparison without DOM measurement)
 *
 * Anything else (em, %, vw, calc, var(), …) is skipped — those tokens won't
 * appear as snap targets, but the discrete picker still binds them.
 */
import { useMemo } from 'react'
import type { Token, TokenKind } from '../pixel-common'
import { useTokensOf } from '../tokens-context'
import { tokenKindForProperty } from './token-mapping'
import { parsePx } from './token-preview'

export interface TokenMatchResult {
  /** Snap targets ready to pass into useScrubbable. */
  snapTargets: Array<{ numericValue: number; token: Token }>
  /** True when there are any snap-able tokens; the input shows a "snap on"
   *  hint via the prefix tint. */
  hasSnapTargets: boolean
  /** Find the token whose numeric value equals `value` (within 0.5px tolerance,
   *  matching how the input rounds). Used for label display + typed-value
   *  auto-bind. */
  matchToken: (value: string) => Token | null
}

const REM_TO_PX = 16

function parseNumeric(value: string): number | null {
  const trimmed = value.trim()
  // Bare number / px / unitless
  const px = parsePx(trimmed)
  if (px != null) return px
  // rem → approximate px (root default is 16; close enough for snap intent)
  const rem = /^(-?[\d.]+)\s*rem$/.exec(trimmed)
  if (rem) return parseFloat(rem[1]) * REM_TO_PX
  // em (treated as 1em = 16px — same approximation as rem)
  const em = /^(-?[\d.]+)\s*em$/.exec(trimmed)
  if (em) return parseFloat(em[1]) * REM_TO_PX
  return null
}

export function useTokenMatch(property: string): TokenMatchResult {
  const kind: TokenKind | null = tokenKindForProperty(property)
  const tokens = useTokensOf(kind)

  const snapTargets = useMemo(() => {
    const out: Array<{ numericValue: number; token: Token }> = []
    for (const t of tokens) {
      const n = parseNumeric(t.value)
      if (n != null) out.push({ numericValue: n, token: t })
    }
    return out
  }, [tokens])

  const matchToken = useMemo(() => {
    return (value: string): Token | null => {
      const n = parseNumeric(value)
      if (n == null) return null
      for (const { numericValue, token } of snapTargets) {
        if (Math.abs(numericValue - n) < 0.5) return token
      }
      return null
    }
  }, [snapTargets])

  return {
    snapTargets,
    hasSnapTargets: snapTargets.length > 0,
    matchToken,
  }
}
