/**
 * Token extraction + cache + source-watch. The long-running server (`pixel-server`,
 * the same process the skill launches) extracts the project's design tokens on
 * boot, writes them to `<dropbox>/design-tokens.json`, and re-extracts whenever
 * a watched source file (globals.css, tailwind.config, …) changes — so the
 * in-app design pane's pickers + drag-snap stay in sync with the project's
 * design system. The cache is served at `GET /tokens`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { TOKENS_CACHE_VERSION, type TokensCache } from './common.js'
import { buildDetectContext } from './adapters/helpers.js'
import { selectAdapter } from './adapters/registry.js'

/** Cache file written into the dropbox root and served at GET /tokens. */
export const TOKENS_FILE = 'design-tokens.json'

/** Empty cache returned when nothing is extracted yet / no tokens detected. */
export function emptyCache(): TokensCache {
  return {
    version: TOKENS_CACHE_VERSION,
    adapterId: 'css-vars-fallback',
    detectedAt: 0,
    watchedPaths: [],
    tokens: [],
  }
}

/**
 * The project whose design tokens we extract. Defaults to the parent of the
 * dropbox root — i.e. the workspace dir the dev runs the server from, where
 * package.json / globals.css / tailwind.config live. Overridable for tests and
 * unusual layouts via `SCREENSHARE_PROJECT_DIR`.
 */
export function resolveProjectDir(root: string): string {
  return process.env.SCREENSHARE_PROJECT_DIR ?? dirname(root)
}

/** Read the cached tokens, or null if absent/unparseable. */
export function readTokenCache(root: string): TokensCache | null {
  try {
    return JSON.parse(readFileSync(join(root, TOKENS_FILE), 'utf8')) as TokensCache
  } catch {
    return null
  }
}

/** Atomic write (temp file → rename) so a reader never sees a half-written cache. */
async function writeCache(root: string, cache: TokensCache): Promise<void> {
  await mkdir(root, { recursive: true })
  const dest = join(root, TOKENS_FILE)
  const tmp = join(root, `.${TOKENS_FILE}.${process.pid}.tmp`)
  await writeFile(tmp, JSON.stringify(cache, null, 2))
  await rename(tmp, dest)
}

/**
 * Detect the project's token adapter, extract its tokens, and write the cache.
 * Returns the cache (with `tokens: []` when the fallback wins), or null if even
 * the fallback declines.
 */
export async function extractAndCacheTokens(
  projectDir: string,
  root: string,
): Promise<TokensCache | null> {
  const selected = selectAdapter(projectDir)
  if (!selected) return null
  const ctx = buildDetectContext(projectDir)
  const set = await selected.adapter.extract({ ...ctx, detection: selected.detection })
  const cache: TokensCache = {
    version: TOKENS_CACHE_VERSION,
    adapterId: set.adapterId,
    detectedAt: set.detectedAt,
    watchedPaths: selected.detection.watchedPaths,
    tokens: set.tokens,
  }
  await writeCache(root, cache)
  return cache
}

/**
 * Watch the adapter's token source files and re-extract on change. Returns the
 * watcher (or null when there's nothing to watch — e.g. the fallback adapter).
 *
 * Note: the watch set is the adapter's `watchedPaths` at boot. If the project
 * later switches stacks (adds a tailwind config where there was none), restart
 * the server to pick up the new source set — value edits to existing sources are
 * handled live. (A re-detect-on-change pass is a future enhancement.)
 */
export function watchTokenSources(
  projectDir: string,
  root: string,
  cache: TokensCache,
  onUpdate?: (cache: TokensCache) => void,
): FSWatcher | null {
  if (cache.watchedPaths.length === 0) return null
  const abs = cache.watchedPaths.map((p) => join(projectDir, p)).filter((p) => existsSync(p))
  if (abs.length === 0) return null

  const watcher = chokidar.watch(abs, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
  })

  let timer: ReturnType<typeof setTimeout> | null = null
  const rescan = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      timer = null
      try {
        const next = await extractAndCacheTokens(projectDir, root)
        if (next) onUpdate?.(next)
      } catch (err) {
        console.error('[screenshare] token re-extract failed:', err)
      }
    }, 50)
  }

  watcher.on('change', rescan).on('add', rescan).on('unlink', rescan)
  return watcher
}
