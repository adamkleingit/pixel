import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  // Don't wipe dist/ on (re)start. `npm run dev` runs this in --watch alongside
  // the example's Vite server in parallel; cleaning would leave a window where
  // dist/ is empty and Vite fails to resolve `@getpixel/ui`. The single entry's
  // outputs are overwritten deterministically each build, so a clean isn't needed.
  clean: false,
  treeshake: true,
  // React is provided by the host app.
  external: ['react', 'react-dom'],
})
