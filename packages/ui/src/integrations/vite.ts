import type { Plugin } from 'vite'
import type { ResolveAppSourceOptions } from './shared'
import { PIXEL_UI_PACKAGE, resolveAppSourcePaths, resolveNoopPath } from './shared'

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

/**
 * Vite plugin: resolve `@getpixel/ui` → its inert build for production bundles
 * (`apply: 'build'`), so the SDK never reaches your users.
 *
 * `isEnabled={false}` only makes Pixel inert at runtime — the static import
 * still pulls the whole SDK into the bundle. This swap removes it from the
 * module graph while every import site keeps compiling: same exports, same
 * shapes, no behaviour.
 */
export function pixelProdStub(): Plugin {
  return {
    name: 'pixel-prod-stub',
    enforce: 'pre',
    apply: 'build',
    resolveId(source) {
      return source === PIXEL_UI_PACKAGE ? resolveNoopPath() : null
    },
  }
}

/**
 * Both Pixel Vite plugins: the dev-only pixel-react alias (time-travel) and the
 * production stub (keeps the SDK out of your bundle). This is what most apps
 * want.
 *
 * ```ts
 * import { resolve } from 'node:path'
 * import { pixel } from '@getpixel/ui/vite'
 *
 * export default defineConfig({
 *   plugins: [pixel({ appDir: resolve(__dirname, 'src') }), react()],
 *   optimizeDeps: { include: ['@getpixel/ui/pixel-react'] },
 * })
 * ```
 */
export function pixel(options: PixelReactAliasOptions = {}): Plugin[] {
  return [pixelReactAlias(options), pixelProdStub()]
}
