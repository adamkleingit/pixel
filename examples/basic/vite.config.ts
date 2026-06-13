import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dir = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(dir, '../..')

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Consume @pixel/ui as a built (blackbox) package via its package exports —
    // no source alias. Dedupe React so the SDK and app share one copy.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5180,
    fs: { allow: [workspaceRoot] },
  },
})
