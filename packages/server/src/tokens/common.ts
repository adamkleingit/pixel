/**
 * Normalized design-token types — the cross-library shape every adapter emits.
 * Ported from Pixel's `@pixel/common` (kept in lockstep with the UI's
 * `packages/ui/src/pixel-common.ts`). The server extracts these from the
 * project's source of truth and serves them to the in-app design pane.
 */

/** The library family a TokenSet was extracted from. */
export type AdapterId =
  | 'shadcn'
  | 'tailwind-v4'
  | 'tailwind-v3'
  | 'mui'
  | 'chakra-v3'
  | 'css-vars-fallback'

/** Primitive token category. Style/component tokens (button-primary) are out. */
export type TokenKind =
  | 'color'
  | 'radius'
  | 'spacing'
  | 'shadow'
  | 'font-size'
  | 'font-weight'
  | 'font-family'
  | 'line-height'
  | 'letter-spacing'
  | 'border-width'
  | 'opacity'
  | 'z-index'

/**
 * How to spell a token at the use site — what the agent writes in source so the
 * edit uses the symbolic form, not the resolved value.
 *   - css-var:    'var(--primary)'
 *   - utility:    Tailwind/shadcn class names — 'bg-primary', 'rounded-md'
 *   - theme-path: MUI/Chakra theme paths — 'palette.primary.main'
 */
export type TokenUsage =
  | { kind: 'css-var'; expr: string }
  | { kind: 'utility'; className: string }
  | { kind: 'theme-path'; path: string; importHint?: string }

/**
 * One token extracted from the project. `id` is stable across value edits and
 * re-orderings — keyed on `(adapterId, sourcePath, declarationName)`.
 */
export type Token = {
  id: string
  name: string
  kind: TokenKind
  value: string
  cssVar?: string
  usage: TokenUsage
  sourcePath: string
  declarationName: string
  group?: string
  description?: string
}

/** Normalized result of one adapter extraction. */
export type TokenSet = {
  adapterId: AdapterId
  detectedAt: number
  tokens: Token[]
}

export const TOKENS_CACHE_VERSION = 1

/** Shape persisted to `<dropbox>/design-tokens.json` and served at GET /tokens. */
export type TokensCache = {
  version: number
  adapterId: AdapterId
  detectedAt: number
  watchedPaths: string[]
  tokens: Token[]
}
