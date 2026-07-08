import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A deliberately minimal consumer config — the point of the pack smoke test is to
// exercise @getpixel/ui exactly the way the README's minimal integration does:
// consumed as a built (blackbox) package via its `exports`, with React deduped so
// the SDK and app share one copy. No `pixel-react` alias (that's the optional
// time-travel path); this proves the plain documented install works.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
