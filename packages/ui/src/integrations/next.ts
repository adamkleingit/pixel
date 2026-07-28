import type { ResolveAppSourceOptions } from './shared'
import {
  COMPILED_REACT_MODULE,
  PIXEL_UI_PACKAGE,
  resolveAppSourcePaths,
  resolvePixelReactPath,
  resolveRealReactPaths,
  shouldAliasPixelReact,
  unifyReactAliases,
} from './shared'

/** Minimal Next.js config fields this helper composes with. */
export interface NextConfigLike {
  transpilePackages?: string[]
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
}

/**
 * Wrap a Next.js config with dev-only pixel-react wiring:
 * - transpile `@getpixel/ui`
 * - unify Next's compiled React aliases with the app's real React (client dev)
 * - route `react` and Next's compiled/react → pixel-react for app source only
 *   (client dev — SWC may split hook imports across both)
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
  const realReactPaths = resolveRealReactPaths(rootDir)

  const transpile = options.transpile !== false
  const userWebpack = config.webpack

  const merged: T = {
    ...config,
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

      return nextConfig
    },
  }

  return merged
}

function mergeTranspilePackages(existing: string[] | undefined, pkg: string): string[] {
  if (!existing) return [pkg]
  return existing.includes(pkg) ? existing : [...existing, pkg]
}
