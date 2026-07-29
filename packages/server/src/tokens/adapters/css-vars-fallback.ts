/**
 * Generic CSS-variables adapter — for apps that theme with hand-rolled custom
 * properties instead of shadcn or Tailwind. Reads `--name: value` declarations
 * out of the global-scope blocks (`:root`, `html`, `:host`) of the project's
 * stylesheets and offers them as `var(--name)` tokens.
 *
 * Always matches, at `confidence: 'low'`, so a library-specific adapter still
 * wins when one applies. A project with no custom properties at all yields an
 * empty set, and the in-app pickers degrade to raw values.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/css-vars-fallback.ts).
 */
import type { Token, TokenKind, TokenSet } from '../common.js'
import { extractBlocks, listCssFiles, parseDecls } from './css.js'
import { classifyByName, makeToken } from './helpers.js'
import type { Adapter, DetectContext, ExtractContext } from './types.js'

/** Blocks whose custom properties are in scope for the whole document. */
const GLOBAL_SCOPE_SELECTORS = [/:root\b/, /(?:^|[\s,}])html\b/, /:host\b/]

/** Blocks that redefine the same names for a dark theme, surfaced as a note. */
const DARK_SCOPE_SELECTORS = [/\.dark\b/, /\[data-theme=["']?dark["']?\]/]

/** A value that paints — anything else named like a colour is really a number. */
const COLOR_VALUE_RE = /^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\()/i
const LENGTH_VALUE_RE = /^-?[\d.]+(px|rem|em|ch|vh|vw|%)$/
const NUMBER_VALUE_RE = /^-?[\d.]+$/

function readGlobalDecls(
  ctx: DetectContext,
  file: string,
  selectors: RegExp[],
): Array<{ name: string; value: string }> {
  const css = ctx.readFile(file)
  if (!css) return []
  return selectors.flatMap((sel) => extractBlocks(css, sel)).flatMap(parseDecls)
}

/**
 * `classifyByName` guesses from the declaration name, which defaults to `color`
 * for anything unrecognized. Without a naming convention to lean on, check the
 * value too, so `--z-modal: 100` and `--sidebar-width: 16rem` don't end up as
 * colours with unpaintable swatches.
 */
function classify(name: string, value: string): TokenKind {
  const byName = classifyByName(name)
  if (byName !== 'color') return byName
  if (COLOR_VALUE_RE.test(value)) return 'color'
  // `var(--other)` aliases inherit the referent's kind, which we can't resolve
  // cheaply; a colour is the likeliest alias and renders a live swatch anyway.
  if (value.startsWith('var(')) return 'color'
  if (LENGTH_VALUE_RE.test(value)) return 'spacing'
  if (NUMBER_VALUE_RE.test(value)) return 'z-index'
  return 'color'
}

/** Files declaring at least one custom property in a global-scope block. */
function findFilesWithGlobalVars(ctx: DetectContext): string[] {
  const matches: string[] = []
  for (const rel of listCssFiles(ctx.projectDir)) {
    if (readGlobalDecls(ctx, rel, GLOBAL_SCOPE_SELECTORS).length > 0) matches.push(rel)
  }
  return matches
}

export const cssVarsFallbackAdapter: Adapter = {
  id: 'css-vars-fallback',
  name: 'CSS variables (generic)',

  detect(ctx) {
    const files = findFilesWithGlobalVars(ctx)
    return {
      confidence: 'low',
      watchedPaths: files,
      notes: files.length
        ? `CSS custom properties in ${files.join(', ')}`
        : 'No library-specific design tokens detected.',
    }
  },

  async extract(ctx: ExtractContext): Promise<TokenSet> {
    const detectedAt = Date.now()
    const tokens: Token[] = []
    const seen = new Set<string>()

    for (const file of ctx.detection.watchedPaths) {
      const darkOverrides = new Map(
        readGlobalDecls(ctx, file, DARK_SCOPE_SELECTORS).map((d) => [d.name, d.value]),
      )
      for (const { name, value } of readGlobalDecls(ctx, file, GLOBAL_SCOPE_SELECTORS)) {
        if (seen.has(name)) continue
        seen.add(name)
        const trimmed = value.trim()
        if (!trimmed) continue
        const cssVar = `--${name}`
        const dark = darkOverrides.get(name)
        tokens.push(
          makeToken('css-vars-fallback', {
            name,
            kind: classify(name, trimmed),
            value: trimmed,
            cssVar,
            usage: { kind: 'css-var', expr: `var(${cssVar})` },
            sourcePath: file,
            declarationName: cssVar,
            group: name.includes('-') ? name.split('-')[0] : undefined,
            description: dark ? `dark: ${dark.trim()}` : undefined,
          }),
        )
      }
    }

    return { adapterId: 'css-vars-fallback', detectedAt, tokens }
  },
}
