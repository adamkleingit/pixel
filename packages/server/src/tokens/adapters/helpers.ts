/**
 * Shared utilities used by multiple adapters: token id construction, CSS-value
 * normalization, kind classification, fs context builder.
 *
 * Ported from Pixel (pixel/packages/agent/src/adapters/helpers.ts).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AdapterId, Token, TokenKind, TokenUsage } from '../common.js'
import type { DetectContext } from './types.js'

/** Build a real fs-backed DetectContext. */
export function buildDetectContext(projectDir: string): DetectContext {
  let pkg: Record<string, unknown> | null = null
  try {
    const raw = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8')
    pkg = JSON.parse(raw) as Record<string, unknown>
  } catch {
    pkg = null
  }
  return {
    projectDir,
    packageJson: pkg,
    readFile(relPath) {
      try {
        return fs.readFileSync(path.join(projectDir, relPath), 'utf-8')
      } catch {
        return null
      }
    },
    exists(relPath) {
      return fs.existsSync(path.join(projectDir, relPath))
    },
  }
}

/** Token id: stable across value/order edits in the source. */
export function tokenId(adapterId: AdapterId, sourcePath: string, declarationName: string): string {
  return `${adapterId}:${sourcePath}:${declarationName}`
}

/** Does package.json (deps or devDeps) include a given dependency? */
export function hasDep(pkg: Record<string, unknown> | null, name: string): boolean {
  if (!pkg) return false
  const d = pkg.dependencies as Record<string, unknown> | undefined
  const dd = pkg.devDependencies as Record<string, unknown> | undefined
  return (d && name in d) || (dd && name in dd) || false
}

/** Extract a major version from a `^4.0.0` / `~3.4.1` / `4.0.0` style range. */
export function depMajor(pkg: Record<string, unknown> | null, name: string): number | null {
  if (!pkg) return null
  const d = pkg.dependencies as Record<string, unknown> | undefined
  const dd = pkg.devDependencies as Record<string, unknown> | undefined
  const range = (d?.[name] ?? dd?.[name]) as string | undefined
  if (!range) return null
  const m = /(\d+)/.exec(range)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Classify a token by its declaration name. Used by adapters without richer
 * structural metadata (shadcn, fallback).
 */
export function classifyByName(name: string): TokenKind {
  const n = name.toLowerCase().replace(/^--/, '')
  if (n === 'radius' || n.startsWith('radius') || n.includes('-radius') || n.startsWith('rounded'))
    return 'radius'
  if (n.includes('shadow')) return 'shadow'
  if (n.startsWith('font-size') || n.startsWith('text-') || n === 'text' || n.startsWith('fontsize'))
    return 'font-size'
  if (n.startsWith('font-weight') || n.startsWith('fontweight')) return 'font-weight'
  if (n.startsWith('font-family') || n.startsWith('fontfamily') || n.startsWith('font-'))
    return 'font-family'
  if (n.startsWith('line-height') || n.startsWith('leading')) return 'line-height'
  if (n.startsWith('letter-spacing') || n.startsWith('tracking')) return 'letter-spacing'
  if (n.startsWith('border-width') || n.endsWith('-border-width')) return 'border-width'
  if (n.startsWith('spacing') || n.startsWith('space-') || n.startsWith('gap-')) return 'spacing'
  if (n === 'opacity' || n.startsWith('opacity') || n.endsWith('-opacity')) return 'opacity'
  return 'color'
}

/**
 * shadcn declares HSL colors as `--primary: 222.2 47.4% 11.2%`. Normalize
 * bare-component values to a paint-ready `hsl(...)` so the swatch renders them.
 */
export function normalizeShadcnColor(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('rgb') ||
    trimmed.startsWith('hsl') ||
    trimmed.startsWith('oklch') ||
    trimmed.startsWith('color(')
  )
    return trimmed
  const m = /^([\d.]+)\s+([\d.]+%)\s+([\d.]+%)/.exec(trimmed)
  if (m) return `hsl(${m[1]} ${m[2]} ${m[3]})`
  return trimmed
}

/** Convenience: build a Token with id derived from its declaration. */
export function makeToken(adapterId: AdapterId, args: Omit<Token, 'id'>): Token {
  return {
    id: tokenId(adapterId, args.sourcePath, args.declarationName),
    ...args,
  }
}

/** Tailwind shorthand vocabulary: token kind + name → standard utility prefix. */
export function tailwindUtilityForKind(kind: TokenKind, name: string): TokenUsage {
  const stripped = name.replace(/^--/, '').replace(/^radius-?/, '').replace(/^text-/, '')
  if (kind === 'radius') {
    return { kind: 'utility', className: stripped ? `rounded-${stripped}` : 'rounded' }
  }
  if (kind === 'font-size') {
    return { kind: 'utility', className: `text-${stripped || name}` }
  }
  return { kind: 'utility', className: `bg-${stripped || name}` }
}
