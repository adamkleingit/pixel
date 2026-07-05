import { defineConfig } from 'tsup'

export default defineConfig({
  // Two entries: the SDK (`.`) and the app-side React wrapper (`./pixel-react`),
  // which the app aliases as `react` for state capture / time-travel. Shared
  // modules (the capture store) split into a common chunk; the store is also
  // pinned to a `globalThis` singleton so both entries see one instance.
  entry: ['src/index.tsx', 'src/pixel-react/index.tsx'],
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
