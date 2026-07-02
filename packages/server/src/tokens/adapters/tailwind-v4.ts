/**
 * Tailwind v4 adapter. v4 uses CSS-native `@theme` blocks:
 * `@theme { --color-primary-500: #...; --font-size-lg: 1.125rem; }`. Scans CSS
 * files under common roots for `@theme` blocks, parses declarations, and emits
 * utility-class spelling derived from the v4 naming convention.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/tailwind-v4.ts).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Token, TokenKind, TokenSet } from '../common.js'
import { depMajor, makeToken } from './helpers.js'
import type { Adapter, DetectContext, ExtractContext } from './types.js'

const SEARCH_DIRS = ['src', 'app', 'styles', 'src/styles', '.']
const MAX_FILES_TO_SCAN = 200

const DECL_RE = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+?)\s*;/g

/** v4 namespaces (the prefix before the user-visible token name). */
const V4_NAMESPACE_TO_KIND: Array<{ prefix: string; kind: TokenKind; utility: string }> = [
  { prefix: 'color-', kind: 'color', utility: 'bg-' },
  { prefix: 'font-size-', kind: 'font-size', utility: 'text-' },
  { prefix: 'font-weight-', kind: 'font-weight', utility: 'font-' },
  { prefix: 'font-family-', kind: 'font-family', utility: 'font-' },
  { prefix: 'line-height-', kind: 'line-height', utility: 'leading-' },
  { prefix: 'letter-spacing-', kind: 'letter-spacing', utility: 'tracking-' },
  { prefix: 'radius-', kind: 'radius', utility: 'rounded-' },
  { prefix: 'shadow-', kind: 'shadow', utility: 'shadow-' },
  { prefix: 'spacing-', kind: 'spacing', utility: 'p-' },
  { prefix: 'border-width-', kind: 'border-width', utility: 'border-' },
  { prefix: 'opacity-', kind: 'opacity', utility: 'opacity-' },
]

function listCssFiles(projectDir: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const dir of SEARCH_DIRS) {
    const abs = path.join(projectDir, dir)
    if (!fs.existsSync(abs)) continue
    walk(abs, projectDir, out, seen)
    if (out.length >= MAX_FILES_TO_SCAN) break
  }
  return out
}

function walk(abs: string, projectDir: string, out: string[], seen: Set<string>): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES_TO_SCAN) return
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = path.join(abs, entry.name)
    if (seen.has(full)) continue
    seen.add(full)
    if (entry.isDirectory()) {
      walk(full, projectDir, out, seen)
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      out.push(path.relative(projectDir, full))
    }
  }
}

function extractThemeBlocks(css: string): string[] {
  const out: string[] = []
  const re = /@theme\b[^{]*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const start = m.index + m[0].length
    let depth = 1
    let i = start
    while (i < css.length && depth > 0) {
      const ch = css[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      i++
    }
    out.push(css.slice(start, i - 1))
  }
  return out
}

function findFilesWithTheme(ctx: DetectContext): string[] {
  const files = listCssFiles(ctx.projectDir)
  const matches: string[] = []
  for (const rel of files) {
    const content = ctx.readFile(rel)
    if (content && /@theme\b/.test(content)) matches.push(rel)
  }
  return matches
}

function classifyV4(name: string): { kind: TokenKind; shortName: string; utility: string } {
  for (const ns of V4_NAMESPACE_TO_KIND) {
    if (name.startsWith(ns.prefix)) {
      const shortName = name.slice(ns.prefix.length)
      return { kind: ns.kind, shortName, utility: `${ns.utility}${shortName}` }
    }
  }
  return { kind: 'color', shortName: name, utility: '' }
}

export const tailwindV4Adapter: Adapter = {
  id: 'tailwind-v4',
  name: 'Tailwind CSS v4',

  detect(ctx) {
    const major = depMajor(ctx.packageJson, 'tailwindcss')
    if (major !== 4) return null
    const filesWithTheme = findFilesWithTheme(ctx)
    if (filesWithTheme.length === 0) return null
    return {
      confidence: 'high',
      watchedPaths: [...filesWithTheme, 'package.json'],
      notes: `@theme block in ${filesWithTheme[0]}`,
    }
  },

  async extract(ctx: ExtractContext): Promise<TokenSet> {
    const detectedAt = Date.now()
    const cssFiles = ctx.detection.watchedPaths.filter((p) => p.endsWith('.css'))
    const tokens: Token[] = []
    const seen = new Set<string>()

    for (const rel of cssFiles) {
      const css = ctx.readFile(rel)
      if (!css) continue
      for (const block of extractThemeBlocks(css)) {
        DECL_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = DECL_RE.exec(block))) {
          const fullName = m[1]
          const value = m[2].trim()
          const declName = `--${fullName}`
          const key = `${rel}:${declName}`
          if (seen.has(key)) continue
          seen.add(key)
          const { kind, shortName, utility } = classifyV4(fullName)
          tokens.push(
            makeToken('tailwind-v4', {
              name: shortName,
              kind,
              value,
              cssVar: declName,
              usage: utility
                ? { kind: 'utility', className: utility }
                : { kind: 'css-var', expr: `var(${declName})` },
              sourcePath: rel,
              declarationName: declName,
            }),
          )
        }
      }
    }

    return { adapterId: 'tailwind-v4', detectedAt, tokens }
  },
}
