import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { pixel } from '@getpixel/ui/vite'
import { defineConfig } from 'vite'

const dir = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(dir, '../..')
const appSrc = resolve(dir, 'src')

export default defineConfig({
  // pixel() = the dev-only pixel-react alias + the production stub that keeps
  // the SDK out of `vite build` output.
  plugins: [pixel({ appDir: appSrc }), react()],
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
    // Allow Cloudflare/localtunnel hostnames when the example is previewed
    // through a public tunnel.
    allowedHosts: true,
  },
})
