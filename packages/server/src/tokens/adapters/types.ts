/**
 * Adapter interface for design-token discovery + extraction. One Adapter per
 * supported CSS/theming library; each reads the project's source of truth
 * (globals.css, tailwind.config, …) and emits the normalized TokenSet shape.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/types.ts).
 */
import type { AdapterId, TokenSet } from '../common.js'

/**
 * Cheap inputs every adapter's detect/extract gets. `readFile`/`exists` are
 * project-relative; `readFile` returns null instead of throwing for missing
 * files (adapters probe a lot).
 */
export type DetectContext = {
  projectDir: string
  packageJson: Record<string, unknown> | null
  readFile(relPath: string): string | null
  exists(relPath: string): boolean
}

/** `confidence` resolves ties when multiple adapters match. */
export type DetectResult = {
  confidence: 'high' | 'medium' | 'low'
  watchedPaths: string[]
  notes?: string
}

/** Extract() reuses the detect result so it doesn't repeat heuristics. */
export type ExtractContext = DetectContext & {
  detection: DetectResult
}

export interface Adapter {
  id: AdapterId
  name: string
  detect(ctx: DetectContext): DetectResult | null
  extract(ctx: ExtractContext): Promise<TokenSet>
}
