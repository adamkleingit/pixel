import type { ResolveAppSourceOptions } from './shared'
import {
  COMPILED_REACT_MODULE,
  PIXEL_UI_PACKAGE,
  resolveAppSourcePaths,
  resolveNoopPath,
  resolvePixelReactPath,
  resolveRealReactPaths,
  shouldAliasPixelReact,
  unifyReactAliases,
} from './shared'

/** Minimal Next.js config fields this helper composes with. */
export interface NextConfigLike {
  transpilePackages?: string[]
  reactStrictMode?: boolean
  webpack?: (
    config: WebpackConfig,
    context: WebpackContext,
  ) => WebpackConfig | void | Promise<WebpackConfig | void>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebpackConfig = any

interface WebpackContext {
  dev: boolean
  isServer: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack: any
}

export interface WithPixelOptions extends ResolveAppSourceOptions {
  /** Add `@getpixel/ui` to `transpilePackages`. Default: true. */
  transpile?: boolean
  /**
   * Resolve `@getpixel/ui` to its inert build in production, so the SDK never
   * ships. Default: true. Turn it off only if you deliberately want Pixel in a
   * production bundle.
   */
  stripInProduction?: boolean
  /**
   * Force `reactStrictMode`. By default it is turned **off in development**,
   * because StrictMode's double-invoke desyncs pixel-react's capture cursor and
   * silently corrupts time-travel frames. Production builds are untouched
   * (StrictMode doesn't double-invoke there). Set `true` to keep strict mode and
   * accept a degraded States pane, or `false` to pin it off everywhere.
   */
  strictMode?: boolean
}

/** `next.config` is evaluated more than once per process; the notice is not. */
let announcedStrictMode = false

/**
 * Wrap a Next.js config with Pixel's bundler wiring.
 *
 * In development (client):
 * - transpile `@getpixel/ui`
 * - unify Next's compiled React aliases with the app's real React
 * - route `react` and Next's compiled/react → pixel-react for app source only
 *   (SWC may split hook imports across both)
 * - turn `reactStrictMode` off, since its double-invoke breaks state capture
 *
 * In production:
 * - resolve `@getpixel/ui` → its inert build, so no SDK code is emitted
 *
 * Usage:
 * ```ts
 * import type { NextConfig } from 'next'
 * import { withPixel } from '@getpixel/ui/next'
 *
 * const nextConfig: NextConfig = { /* your config *\/ }
 * export default withPixel(nextConfig, { rootDir: __dirname, appDir: 'src' })
 * ```
 */
export function withPixel<T extends NextConfigLike>(config: T, options: WithPixelOptions = {}): T {
  const rootDir = options.rootDir ?? process.cwd()
  const appSourcePaths = resolveAppSourcePaths({ rootDir, appDir: options.appDir })
  const pixelReactPath = resolvePixelReactPath()
  const noopPath = resolveNoopPath()
  const realReactPaths = resolveRealReactPaths(rootDir)

  const transpile = options.transpile !== false
  const strip = options.stripInProduction !== false
  const userWebpack = config.webpack

  // `next dev` runs with NODE_ENV=development, `next build` with production.
  // The webpack callback's `context.dev` says the same thing, but reactStrictMode
  // is a top-level field decided before any compilation starts.
  const isDev = process.env.NODE_ENV !== 'production'
  const strictMode = options.strictMode ?? (isDev ? false : config.reactStrictMode)
  if (isDev && strictMode === false && config.reactStrictMode !== false && !announcedStrictMode) {
    announcedStrictMode = true
    // eslint-disable-next-line no-console
    console.log(
      '[pixel] reactStrictMode is off in development — its double-invoke desyncs ' +
        "pixel-react's state capture. Pass `strictMode: true` to withPixel to keep it.",
    )
  }

  const merged: T = {
    ...config,
    ...(typeof strictMode === 'boolean' ? { reactStrictMode: strictMode } : null),
    ...(transpile
      ? {
          transpilePackages: mergeTranspilePackages(config.transpilePackages, PIXEL_UI_PACKAGE),
        }
      : null),
    webpack(config, context) {
      let nextConfig = userWebpack ? userWebpack(config, context) ?? config : config

      if (context.dev && !context.isServer) {
        nextConfig.resolve ??= {}
        nextConfig.resolve.alias = unifyReactAliases(nextConfig.resolve.alias ?? {}, realReactPaths)

        nextConfig.plugins ??= []
        const aliasPixelReact = (resource: { context: string; request: string }) => {
          if (shouldAliasPixelReact(resource.context, appSourcePaths)) {
            resource.request = pixelReactPath
          }
        }

        nextConfig.plugins.unshift(
          new context.webpack.NormalModuleReplacementPlugin(/^react$/, aliasPixelReact),
          new context.webpack.NormalModuleReplacementPlugin(COMPILED_REACT_MODULE, aliasPixelReact),
        )
      }

      // Both bundles: a server-rendered `<PixelProvider>` would otherwise pull the
      // SDK into the server graph too.
      if (!context.dev && strip) {
        nextConfig.resolve ??= {}
        nextConfig.resolve.alias = {
          ...(nextConfig.resolve.alias ?? {}),
          [`${PIXEL_UI_PACKAGE}$`]: noopPath,
        }
      }

      return nextConfig
    },
  }

  return merged
}

function mergeTranspilePackages(existing: string[] | undefined, pkg: string): string[] {
  if (!existing) return [pkg]
  return existing.includes(pkg) ? existing : [...existing, pkg]
}
