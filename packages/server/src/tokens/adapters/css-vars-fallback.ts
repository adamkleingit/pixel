/**
 * Generic CSS-variables fallback adapter. Matches any project as `confidence:
 * 'low'` so it only wins when no library-specific adapter does. Returns an empty
 * token set — a project with no recognized token source simply has no tokens to
 * snap to (the in-app pickers degrade gracefully).
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/css-vars-fallback.ts).
 */
import type { TokenSet } from '../common.js'
import type { Adapter } from './types.js'

export const cssVarsFallbackAdapter: Adapter = {
  id: 'css-vars-fallback',
  name: 'CSS variables (generic)',

  detect() {
    return {
      confidence: 'low',
      watchedPaths: [],
      notes: 'No library-specific design tokens detected.',
    }
  },

  async extract(): Promise<TokenSet> {
    return {
      adapterId: 'css-vars-fallback',
      detectedAt: Date.now(),
      tokens: [],
    }
  },
}
