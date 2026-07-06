/**
 * Tailwind v3 adapter. Loads `tailwind.config.{ts,js,cjs,mjs}` and walks
 * `theme` + `theme.extend`, flattening nested objects (`colors.brand.500`
 * → `brand-500`) into Tailwind utility-class tokens.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/tailwind-v3.ts).
 */
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Token, TokenKind, TokenSet } from '../common.js'
import { depMajor, makeToken } from './helpers.js'
import type { Adapter, DetectContext, ExtractContext } from './types.js'

const CONFIG_CANDIDATES = [
  'tailwind.config.ts',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
]

/** Tailwind theme namespace → token category + the utility-class prefix. */
const THEME_KEY_TO_KIND: Record<string, { kind: TokenKind; utility: string }> = {
  colors: { kind: 'color', utility: 'bg-' },
  backgroundColor: { kind: 'color', utility: 'bg-' },
  textColor: { kind: 'color', utility: 'text-' },
  borderColor: { kind: 'color', utility: 'border-' },
  fontSize: { kind: 'font-size', utility: 'text-' },
  fontWeight: { kind: 'font-weight', utility: 'font-' },
  fontFamily: { kind: 'font-family', utility: 'font-' },
  lineHeight: { kind: 'line-height', utility: 'leading-' },
  letterSpacing: { kind: 'letter-spacing', utility: 'tracking-' },
  borderRadius: { kind: 'radius', utility: 'rounded-' },
  boxShadow: { kind: 'shadow', utility: 'shadow-' },
  spacing: { kind: 'spacing', utility: 'p-' },
  borderWidth: { kind: 'border-width', utility: 'border-' },
  opacity: { kind: 'opacity', utility: 'opacity-' },
}

function findConfigPath(ctx: DetectContext): string | null {
  for (const p of CONFIG_CANDIDATES) if (ctx.exists(p)) return p
  return null
}

/** Flatten one theme namespace's nested object into `[name, value]` pairs. */
function flatten(value: unknown, prefix: string, out: Array<{ name: string; value: string }>): void {
  if (value == null || typeof value === 'function') return
  if (typeof value === 'string') {
    if (prefix) out.push({ name: prefix, value })
    return
  }
  if (typeof value === 'number') {
    if (prefix) out.push({ name: prefix, value: String(value) })
    return
  }
  if (Array.isArray(value)) {
    if (typeof value[0] === 'string' && prefix) {
      out.push({
        name: prefix,
        value: value.filter((v) => typeof v === 'string').join(', '),
      })
    }
    return
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = prefix ? `${prefix}-${k}` : k
      flatten(v, next, out)
    }
  }
}

function mergeThemeShallow(
  base: Record<string, unknown>,
  extend: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(extend)) {
    const existing = merged[k]
    if (
      existing &&
      typeof existing === 'object' &&
      typeof v === 'object' &&
      !Array.isArray(existing) &&
      !Array.isArray(v)
    ) {
      merged[k] = { ...(existing as object), ...(v as object) }
    } else {
      merged[k] = v
    }
  }
  return merged
}

/** Pure, testable token extraction from an already-resolved Tailwind theme. */
export function extractFromTheme(theme: Record<string, unknown>, configRel: string): Token[] {
  const tokens: Token[] = []
  for (const [themeKey, info] of Object.entries(THEME_KEY_TO_KIND)) {
    const namespace = theme[themeKey]
    if (!namespace || typeof namespace !== 'object') continue
    const flat: Array<{ name: string; value: string }> = []
    flatten(namespace, '', flat)
    for (const { name, value } of flat) {
      const displayName = name === 'DEFAULT' ? '' : name.replace(/-DEFAULT$/, '')
      const className = displayName ? `${info.utility}${displayName}` : info.utility.replace(/-$/, '')
      tokens.push(
        makeToken('tailwind-v3', {
          name: displayName,
          kind: info.kind,
          value: String(value),
          usage: { kind: 'utility', className },
          sourcePath: configRel,
          declarationName: `${themeKey}.${name}`,
          group: displayName.includes('-') ? displayName.split('-')[0] : undefined,
        }),
      )
    }
  }
  return tokens
}

/**
 * Load a tailwind.config.* file as an ES module. Throws on failure — the
 * adapter's `extract()` wraps this and returns an empty TokenSet on error.
 * Cache-busts via a `?t=` query so resyncs see fresh source.
 */
async function loadConfig(
  projectDir: string,
  configRel: string,
): Promise<{ theme: Record<string, unknown>; extend: Record<string, unknown> }> {
  const abs = path.join(projectDir, configRel)
  const url = pathToFileURL(abs).href + `?t=${Date.now()}`
  const mod = (await import(url)) as Record<string, unknown>
  const cfg = (mod.default ?? mod.config ?? mod) as Record<string, unknown>
  const theme = (cfg.theme as Record<string, unknown> | undefined) ?? {}
  const extend = (theme.extend as Record<string, unknown> | undefined) ?? {}
  return { theme, extend }
}

export const tailwindV3Adapter: Adapter = {
  id: 'tailwind-v3',
  name: 'Tailwind CSS v3',

  detect(ctx) {
    const major = depMajor(ctx.packageJson, 'tailwindcss')
    if (major !== 3) return null
    const config = findConfigPath(ctx)
    if (!config) return null
    return {
      confidence: 'high',
      watchedPaths: [config, 'package.json'],
      notes: `Tailwind v3 config at ${config}`,
    }
  },

  async extract(ctx: ExtractContext): Promise<TokenSet> {
    const detectedAt = Date.now()
    const configRel = ctx.detection.watchedPaths.find((p) => CONFIG_CANDIDATES.includes(p))
    if (!configRel) return { adapterId: 'tailwind-v3', detectedAt, tokens: [] }

    let theme: Record<string, unknown>
    try {
      const { theme: base, extend } = await loadConfig(ctx.projectDir, configRel)
      theme = mergeThemeShallow(base, extend)
    } catch {
      return { adapterId: 'tailwind-v3', detectedAt, tokens: [] }
    }

    return {
      adapterId: 'tailwind-v3',
      detectedAt,
      tokens: extractFromTheme(theme, configRel),
    }
  },
}
