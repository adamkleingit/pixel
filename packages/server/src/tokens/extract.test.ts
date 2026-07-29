/**
 * Token extraction + cache. Builds throwaway project fixtures on disk, runs the
 * adapter pipeline, and asserts the normalized tokens + the on-disk cache the
 * design pane reads over GET /tokens.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { selectAdapter } from './adapters/registry.js'
import { extractAndCacheTokens, readTokenCache, requireProjectDir, TOKENS_FILE } from './extract.js'

const dirs: string[] = []
function tmpProject(): string {
  const d = mkdtempSync(join(tmpdir(), 'ss-tokens-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const SHADCN_GLOBALS = `
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 47.4% 11.2%;
  --primary: 222.2 47.4% 11.2%;
  --radius: 0.5rem;
  --brand-coral: #ff6b5c;
}
.dark {
  --background: 222 47% 11%;
}
`

describe('token extraction', () => {
  it('requireProjectDir fails without PIXEL_PROJECT_DIR', () => {
    const prev = process.env.PIXEL_PROJECT_DIR
    delete process.env.PIXEL_PROJECT_DIR
    try {
      expect(() => requireProjectDir()).toThrow(/PIXEL_PROJECT_DIR is required/)
    } finally {
      if (prev === undefined) delete process.env.PIXEL_PROJECT_DIR
      else process.env.PIXEL_PROJECT_DIR = prev
    }
  })

  it('requireProjectDir resolves relative paths from cwd', () => {
    const project = tmpProject()
    const prev = process.env.PIXEL_PROJECT_DIR
    process.env.PIXEL_PROJECT_DIR = '.'
    try {
      expect(requireProjectDir(project)).toBe(project)
    } finally {
      if (prev === undefined) delete process.env.PIXEL_PROJECT_DIR
      else process.env.PIXEL_PROJECT_DIR = prev
    }
  })

  it('shadcn: extracts :root vars with utility/css-var spellings + writes the cache', async () => {
    const project = tmpProject()
    const root = join(project, '.pixel')
    writeFileSync(join(project, 'globals.css'), SHADCN_GLOBALS)

    const selected = selectAdapter(project)
    expect(selected?.adapter.id).toBe('shadcn')

    const cache = await extractAndCacheTokens(project, root)
    expect(cache).not.toBeNull()
    expect(cache!.adapterId).toBe('shadcn')

    const byName = Object.fromEntries(cache!.tokens.map((t) => [t.name, t]))
    // Built-in shadcn color → Tailwind utility spelling.
    expect(byName.primary.kind).toBe('color')
    expect(byName.primary.usage).toEqual({ kind: 'utility', className: 'bg-primary' })
    // HSL shorthand normalized to a paint-ready value.
    expect(byName.primary.value).toBe('hsl(222.2 47.4% 11.2%)')
    // radius classified + spelled as a rounded utility.
    expect(byName.radius.kind).toBe('radius')
    // Custom (non-builtin) token falls back to a css-var spelling.
    expect(byName['brand-coral'].usage).toEqual({ kind: 'css-var', expr: 'var(--brand-coral)' })

    // The cache is on disk and reads back identically.
    const onDisk = readTokenCache(root)
    expect(onDisk).toEqual(cache)
    expect(onDisk!.watchedPaths).toContain('globals.css')
  })

  it('tailwind v4: extracts @theme declarations with v4 utility spellings', async () => {
    const project = tmpProject()
    const root = join(project, '.pixel')
    writeFileSync(
      join(project, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { tailwindcss: '^4.0.0' } }),
    )
    mkdirSync(join(project, 'src'))
    writeFileSync(
      join(project, 'src', 'app.css'),
      `@theme {\n  --color-brand: #4f46e5;\n  --radius-lg: 12px;\n  --spacing-4: 16px;\n}\n`,
    )

    const selected = selectAdapter(project)
    expect(selected?.adapter.id).toBe('tailwind-v4')

    const cache = await extractAndCacheTokens(project, root)
    const byName = Object.fromEntries(cache!.tokens.map((t) => [t.name, t]))
    expect(byName.brand.kind).toBe('color')
    expect(byName.brand.usage).toEqual({ kind: 'utility', className: 'bg-brand' })
    expect(byName.lg.kind).toBe('radius')
    expect(byName['4'].kind).toBe('spacing')
    expect(byName['4'].value).toBe('16px')
  })

  it('no token source: falls back to an empty set', async () => {
    const project = tmpProject()
    const root = join(project, '.pixel')
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'plain' }))

    const cache = await extractAndCacheTokens(project, root)
    expect(cache!.adapterId).toBe('css-vars-fallback')
    expect(cache!.tokens).toEqual([])
    expect(readTokenCache(root)!.tokens).toEqual([])
    // Sanity: the cache file exists at the documented path.
    expect(readTokenCache(root)).not.toBeNull()
    expect(join(root, TOKENS_FILE).endsWith('design-tokens.json')).toBe(true)
  })

  it('generic css vars: extracts hand-rolled :root properties as var() tokens', async () => {
    const project = tmpProject()
    const root = join(project, '.pixel')
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'plain' }))
    mkdirSync(join(project, 'src'))
    writeFileSync(
      join(project, 'src', 'index.css'),
      `:root {\n` +
        `  --color-accent: #4f46e5;\n` +
        `  --color-surface: var(--color-accent);\n` +
        `  --sidebar-width: 16rem;\n` +
        `  --z-modal: 100;\n` +
        `  --font-family-body: Inter, sans-serif;\n` +
        `}\n` +
        `[data-theme="dark"] {\n  --color-accent: #a5b4fc;\n}\n` +
        `.card { --local-only: 4px; }\n`,
    )

    const selected = selectAdapter(project)
    expect(selected?.adapter.id).toBe('css-vars-fallback')

    const cache = await extractAndCacheTokens(project, root)
    const byName = Object.fromEntries(cache!.tokens.map((t) => [t.name, t]))

    expect(byName['color-accent'].kind).toBe('color')
    expect(byName['color-accent'].value).toBe('#4f46e5')
    expect(byName['color-accent'].usage).toEqual({
      kind: 'css-var',
      expr: 'var(--color-accent)',
    })
    expect(byName['color-accent'].sourcePath).toBe(join('src', 'index.css'))
    // A dark-scope redeclaration rides along as a note rather than a second token.
    expect(byName['color-accent'].description).toBe('dark: #a5b4fc')
    expect(byName['color-surface'].kind).toBe('color')

    // Names classify as colors by default, so the value decides for the rest.
    expect(byName['sidebar-width'].kind).toBe('spacing')
    expect(byName['z-modal'].kind).toBe('z-index')
    expect(byName['font-family-body'].kind).toBe('font-family')

    // Component-scoped properties aren't global tokens.
    expect(byName['local-only']).toBeUndefined()

    expect(readTokenCache(root)!.watchedPaths).toEqual([join('src', 'index.css')])
  })

  it('generic css vars: never outranks a library-specific adapter', async () => {
    const project = tmpProject()
    writeFileSync(join(project, 'globals.css'), SHADCN_GLOBALS)
    mkdirSync(join(project, 'src'))
    writeFileSync(join(project, 'src', 'extra.css'), `:root { --brand: #fff; }\n`)

    expect(selectAdapter(project)?.adapter.id).toBe('shadcn')
  })
})
