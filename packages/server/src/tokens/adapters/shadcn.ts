/**
 * shadcn/ui adapter. Reads CSS custom properties from `globals.css` `:root` and
 * `.dark` blocks; emits Tailwind utility-class spelling for names the shadcn
 * convention covers, and `var(--name)` for everything else. Also handles
 * shadcn-on-Tailwind-v4 (`@theme { … }` blocks) via the same parser.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/shadcn.ts).
 */
import type { Token, TokenKind, TokenSet, TokenUsage } from '../common.js'
import { extractBlocks, parseDecls } from './css.js'
import { classifyByName, makeToken, normalizeShadcnColor } from './helpers.js'
import type { Adapter, DetectContext, ExtractContext } from './types.js'

const GLOBALS_CANDIDATES = [
  'src/app/globals.css',
  'app/globals.css',
  'src/globals.css',
  'styles/globals.css',
  'src/styles/globals.css',
  'globals.css',
]

const TAILWIND_CONFIG_CANDIDATES = [
  'tailwind.config.ts',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
]

/** Names every shadcn `globals.css` carries — the strong detect signal. */
const SHADCN_REQUIRED_NAMES = ['--background', '--foreground', '--primary']

/** Names Tailwind has a built-in utility prefix for. Drives utility vs css-var. */
const TAILWIND_BUILTIN_COLOR_NAMES = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
])

const TAILWIND_BUILTIN_RADIUS_NAMES = new Set(['radius', 'radius-sm', 'radius-md', 'radius-lg', 'radius-xl'])

function findGlobalsPath(ctx: DetectContext): string | null {
  for (const p of GLOBALS_CANDIDATES) if (ctx.exists(p)) return p
  return null
}

function findTailwindConfigPath(ctx: DetectContext): string | null {
  for (const p of TAILWIND_CONFIG_CANDIDATES) if (ctx.exists(p)) return p
  return null
}

function usageForToken(name: string, kind: TokenKind, cssVar: string): TokenUsage {
  if (kind === 'color' && TAILWIND_BUILTIN_COLOR_NAMES.has(name)) {
    return { kind: 'utility', className: `bg-${name}` }
  }
  if (kind === 'radius' && TAILWIND_BUILTIN_RADIUS_NAMES.has(name)) {
    const suffix = name === 'radius' ? '' : name.replace(/^radius-/, '-')
    return { kind: 'utility', className: `rounded${suffix}` }
  }
  return { kind: 'css-var', expr: `var(${cssVar})` }
}

function isShadcnHsl(value: string): boolean {
  return /^\s*[\d.]+\s+[\d.]+%\s+[\d.]+%/.test(value)
}

function refineKind(name: string, value: string): TokenKind {
  if (isShadcnHsl(value)) return 'color'
  return classifyByName(name)
}

export const shadcnAdapter: Adapter = {
  id: 'shadcn',
  name: 'shadcn/ui',

  detect(ctx) {
    const globalsPath = findGlobalsPath(ctx)
    if (!globalsPath) return null
    const css = ctx.readFile(globalsPath)
    if (!css) return null

    const rootBlocks = extractBlocks(css, /:root\b/)
    const themeBlocks = extractBlocks(css, /@theme\b/)
    const allDecls = [...rootBlocks, ...themeBlocks].flatMap(parseDecls)
    const names = new Set(allDecls.map((d) => `--${d.name}`))

    const hasAllRequired = SHADCN_REQUIRED_NAMES.every((n) => names.has(n))
    if (!hasAllRequired) return null

    const watchedPaths = [globalsPath]
    const tailwindConfig = findTailwindConfigPath(ctx)
    if (tailwindConfig) watchedPaths.push(tailwindConfig)

    return {
      confidence: 'high',
      watchedPaths,
      notes: `shadcn tokens declared in ${globalsPath}`,
    }
  },

  async extract(ctx: ExtractContext): Promise<TokenSet> {
    const detectedAt = Date.now()
    const globalsPath = ctx.detection.watchedPaths.find((p) => p.endsWith('.css'))
    if (!globalsPath) {
      return { adapterId: 'shadcn', detectedAt, tokens: [] }
    }
    const css = ctx.readFile(globalsPath) ?? ''
    const rootBlocks = extractBlocks(css, /:root\b/)
    const darkBlocks = extractBlocks(css, /\.dark\b/)
    const themeBlocks = extractBlocks(css, /@theme\b/)

    const rootDecls = [...rootBlocks, ...themeBlocks].flatMap(parseDecls)
    const darkOverrides = new Map<string, string>()
    for (const d of darkBlocks.flatMap(parseDecls)) {
      darkOverrides.set(d.name, d.value)
    }

    const seen = new Set<string>()
    const tokens: Token[] = []
    for (const { name, value } of rootDecls) {
      if (seen.has(name)) continue
      seen.add(name)
      const kind = refineKind(name, value)
      const resolvedValue = kind === 'color' ? normalizeShadcnColor(value) : value.trim()
      const cssVar = `--${name}`
      const darkVariant = darkOverrides.get(name)
      tokens.push(
        makeToken('shadcn', {
          name,
          kind,
          value: resolvedValue,
          cssVar,
          usage: usageForToken(name, kind, cssVar),
          sourcePath: globalsPath,
          declarationName: cssVar,
          description: darkVariant ? `dark: ${darkVariant.trim()}` : undefined,
        }),
      )
    }

    return { adapterId: 'shadcn', detectedAt, tokens }
  },
}
