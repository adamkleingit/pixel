/**
 * Adapter registry + dispatch. Runs every adapter's detect() against a project
 * and picks the highest-confidence match. Ties resolve by registry order.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/registry.ts), trimmed to
 * the adapters shipped in the pixel port. MUI + Chakra are a future TODO —
 * their parsers (vm/babel of `createTheme`/`defineConfig`) are heavier; add them
 * here when needed.
 */
import type { AdapterId } from '../common.js'
import { shadcnAdapter } from './shadcn.js'
import { tailwindV4Adapter } from './tailwind-v4.js'
import { tailwindV3Adapter } from './tailwind-v3.js'
import { cssVarsFallbackAdapter } from './css-vars-fallback.js'
import { buildDetectContext } from './helpers.js'
import type { Adapter, DetectResult } from './types.js'

/**
 * Registry order matters for tie-breaking: shadcn before generic Tailwind (its
 * detect signal is strictly more specific); the fallback is last so it only
 * "wins" when nothing else does.
 */
export const ADAPTERS: Adapter[] = [
  shadcnAdapter,
  tailwindV4Adapter,
  tailwindV3Adapter,
  cssVarsFallbackAdapter,
]

export type Selected = {
  adapter: Adapter
  detection: DetectResult
}

const CONFIDENCE_RANK: Record<DetectResult['confidence'], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

/** Find the best-matching adapter for a project. Null only if even the fallback
 *  declines (shouldn't happen — the fallback always matches). */
export function selectAdapter(projectDir: string): Selected | null {
  const ctx = buildDetectContext(projectDir)
  let best: Selected | null = null
  for (const adapter of ADAPTERS) {
    const detection = adapter.detect(ctx)
    if (!detection) continue
    if (!best || CONFIDENCE_RANK[detection.confidence] > CONFIDENCE_RANK[best.detection.confidence]) {
      best = { adapter, detection }
    }
  }
  return best
}

/** Look up an adapter by id. */
export function getAdapter(id: AdapterId): Adapter | null {
  return ADAPTERS.find((a) => a.id === id) ?? null
}
