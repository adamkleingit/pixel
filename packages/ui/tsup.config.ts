import { defineConfig } from 'tsup'

export default defineConfig({
  // The SDK (`.`), the app-side React wrapper (`./pixel-react`) which the app
  // aliases as `react` for state capture / time-travel, the inert production
  // build (`./noop`) the integrations swap in, and the bundler integrations
  // themselves. Shared modules (the capture store) split into a common chunk;
  // the store is also pinned to a `globalThis` singleton so both entries see
  // one instance.
  entry: [
    'src/index.tsx',
    'src/noop.tsx',
    'src/pixel-react/index.tsx',
    'src/integrations/next.ts',
    'src/integrations/vite.ts',
  ],
  format: ['esm'],
  splitting: true,
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
