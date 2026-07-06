// Local stub of the @pixel/common types used by ported design/drag code.
// (The real package carries agent/setup types we don't need in-app.)
export type ValueKind =
  | 'string' | 'number' | 'boolean' | 'null' | 'undefined'
  | 'array' | 'object' | 'node' | 'fn' | 'unknown'

export type TokenKind =
  | 'color' | 'radius' | 'spacing' | 'shadow' | 'font-size' | 'font-weight'
  | 'font-family' | 'line-height' | 'letter-spacing' | 'border-width' | 'opacity' | 'z-index'

export type TokenUsage =
  | { kind: 'css-var'; expr: string }
  | { kind: 'utility'; className: string }
  | { kind: 'theme-path'; path: string; importHint?: string }

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

export type TokenSource = {
  tokenId: string
  tokenName: string
  usage: TokenUsage
  resolvedValue: string
}

export const APP_PREVIEW_STORY_ID = '__pixel_app_preview__'
