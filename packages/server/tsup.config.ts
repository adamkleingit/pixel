import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Runnable as `npx @getpixel/server` / `pixel-server`.
  banner: { js: '#!/usr/bin/env node' },
})
