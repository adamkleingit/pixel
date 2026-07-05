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
import { extractAndCacheTokens, readTokenCache, TOKENS_FILE } from './extract.js'

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
})
