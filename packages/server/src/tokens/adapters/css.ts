/**
 * CSS scanning + parsing shared by the adapters that read stylesheets
 * (shadcn, Tailwind v4, the generic CSS-variable fallback).
 *
 * Deliberately regex-based rather than a real CSS parser: adapters run on every
 * boot and on every watched-file change, and all they need is custom-property
 * declarations out of a handful of top-level blocks.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const SEARCH_DIRS = ['src', 'app', 'styles', 'src/styles', '.']
const MAX_FILES_TO_SCAN = 200

/** `--name: value;` — the only declaration shape any adapter cares about. */
const DECL_RE = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+?)\s*;/g

/** Project-relative paths of the CSS files under the conventional source roots. */
export function listCssFiles(projectDir: string): string[] {
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

/**
 * Pluck the body of every block whose selector matches. Handles nested braces
 * with a depth counter — robust enough for conventional stylesheets.
 */
export function extractBlocks(css: string, selectorRe: RegExp): string[] {
  const blocks: string[] = []
  const matchRe = new RegExp(selectorRe.source, selectorRe.flags.replace('g', '') + 'g')
  let m: RegExpExecArray | null
  while ((m = matchRe.exec(css))) {
    const openIdx = css.indexOf('{', m.index + m[0].length - 1)
    if (openIdx < 0) continue
    let depth = 1
    let i = openIdx + 1
    while (i < css.length && depth > 0) {
      const ch = css[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      i++
    }
    blocks.push(css.slice(openIdx + 1, i - 1))
  }
  return blocks
}

export function parseDecls(blockBody: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = []
  DECL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DECL_RE.exec(blockBody))) {
    out.push({ name: m[1], value: m[2] })
  }
  return out
}
