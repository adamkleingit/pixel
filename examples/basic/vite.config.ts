import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const dir = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(dir, '../..')
const appSrc = resolve(dir, 'src')

/**
 * Route the APP's `react` through pixel-react (`@getpixel/ui/pixel-react`) so its
 * hooks are captured for time-travel — but ONLY for files under the app's own
 * `src/`. Everything else (node_modules — including `@getpixel/ui` itself and
 * `react-dom`) keeps the real React, so there is one React runtime and Pixel's
 * own UI is never captured/frozen. Scoping to `appSrc` (not just "exclude
 * node_modules") is deliberate: Vite pre-bundles `@getpixel/ui` through esbuild
 * where importer paths aren't reliably under `node_modules`, so a path-substring
 * exclusion leaks the alias into the SDK. pixel-react itself imports the real
 * `react` (it's in node_modules, outside appSrc), avoiding the circular alias.
 *
 * Dev only: a production build has no Pixel and no alias.
 */
function pixelReactAlias(): Plugin {
  return {
    name: 'pixel-react-alias',
    enforce: 'pre',
    apply: 'serve',
    async resolveId(source, importer) {
      if (source !== 'react') return null
      if (!importer || !importer.startsWith(appSrc)) return null
      const resolved = await this.resolve('@getpixel/ui/pixel-react', importer, {
        skipSelf: true,
      })
      return resolved?.id ?? null
    },
  }
}

export default defineConfig({
  plugins: [pixelReactAlias(), react()],
  resolve: {
    // Consume @getpixel/ui as a built (blackbox) package via its package exports —
    // no source alias. Dedupe React so the SDK and app share one copy.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundle the wrapper so the alias resolves consistently across reloads.
    include: ['@getpixel/ui/pixel-react'],
  },
  server: {
    // Offset from main's 5180 so the worktree example can run in parallel.
    port: 5280,
    fs: { allow: [workspaceRoot] },
  },
})
