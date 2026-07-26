import type { Plugin } from 'vite'
import type { ResolveAppSourceOptions } from './shared'
import { PIXEL_UI_PACKAGE, resolveAppSourcePaths } from './shared'

export interface PixelReactAliasOptions extends ResolveAppSourceOptions {}

/**
 * Vite plugin: alias `react` → `@getpixel/ui/pixel-react` for app source only.
 * Dev-only (`apply: 'serve'`).
 *
 * Usage:
 * ```ts
 * import { pixelReactAlias } from '@getpixel/ui/vite'
 * import { resolve } from 'node:path'
 *
 * export default defineConfig({
 *   plugins: [pixelReactAlias({ appDir: resolve(__dirname, 'src') }), react()],
 *   optimizeDeps: { include: ['@getpixel/ui/pixel-react'] },
 * })
 * ```
 */
export function pixelReactAlias(options: PixelReactAliasOptions = {}): Plugin {
  const appSourcePaths = resolveAppSourcePaths(options)

  return {
    name: 'pixel-react-alias',
    enforce: 'pre',
    apply: 'serve',
    async resolveId(source, importer) {
      if (source !== 'react') return null
      if (!importer) return null

      const normalizedImporter = importer.replace(/\\/g, '/')
      if (!appSourcePaths.some((root) => normalizedImporter.includes(root))) return null

      const resolved = await this.resolve(`${PIXEL_UI_PACKAGE}/pixel-react`, importer, {
        skipSelf: true,
      })
      return resolved?.id ?? null
    },
  }
}
