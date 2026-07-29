import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import {
  COMPILED_REACT_MODULE,
  isAppSource,
  normalizePath,
  resolveAppSourcePaths,
  resolveNoopPath,
  resolvePixelReactPath,
  shouldAliasPixelReact,
  shouldSkipReactReplacement,
  unifyReactAliases,
} from './shared'

describe('integrations/shared', () => {
  it('normalizePath converts backslashes', () => {
    expect(normalizePath('C:\\app\\src\\page.tsx')).toBe('C:/app/src/page.tsx')
  })

  it('resolveAppSourcePaths resolves relative dirs from rootDir', () => {
    expect(resolveAppSourcePaths({ rootDir: '/proj', appDir: 'src' })).toEqual(['/proj/src'])
    expect(resolveAppSourcePaths({ rootDir: '/proj', appDir: ['src', 'app'] })).toEqual([
      '/proj/src',
      '/proj/app',
    ])
  })

  it('isAppSource matches webpack module context under app roots', () => {
    const roots = ['/proj/packages/client/src']
    expect(isAppSource('/proj/packages/client/src/app/page.tsx', roots)).toBe(true)
    expect(isAppSource('/proj/node_modules/foo/index.js', roots)).toBe(false)
  })

  it('shouldSkipReactReplacement skips pixel-react and the SDK bundle', () => {
    expect(shouldSkipReactReplacement('/app/node_modules/@getpixel/ui/dist/pixel-react/index.js')).toBe(
      true,
    )
    expect(shouldSkipReactReplacement('/app/node_modules/@getpixel/ui/dist/index.js')).toBe(true)
    expect(shouldSkipReactReplacement('/app/src/Button.tsx')).toBe(false)
  })

  it('shouldAliasPixelReact matches app source but skips pixel bundles', () => {
    const roots = ['/proj/packages/client/src']
    expect(shouldAliasPixelReact('/proj/packages/client/src/app/page.tsx', roots)).toBe(true)
    expect(shouldAliasPixelReact('/app/node_modules/@getpixel/ui/dist/index.js', roots)).toBe(false)
    expect(shouldAliasPixelReact('/proj/node_modules/foo/index.js', roots)).toBe(false)
  })

  it('COMPILED_REACT_MODULE matches Next compiled react entry', () => {
    expect(COMPILED_REACT_MODULE.test('node_modules/next/dist/compiled/react/index.js')).toBe(true)
    expect(COMPILED_REACT_MODULE.test('node_modules\\next\\dist\\compiled\\react\\index.js')).toBe(true)
    expect(COMPILED_REACT_MODULE.test('node_modules/react/index.js')).toBe(false)
  })

  it('resolves dist entries from the package root, wherever the caller was bundled', () => {
    const pkg = resolveAppSourcePaths({ rootDir: process.cwd(), appDir: 'packages/ui' })[0]
    // Every layout tsup may emit must agree on where the entries are.
    const callers = [
      `${pkg}/src/integrations/shared.ts`,
      `${pkg}/dist/integrations/vite.js`,
      `${pkg}/dist/chunk-ABC123.js`,
    ].map((p) => pathToFileURL(p).href)

    for (const caller of callers) {
      expect(normalizePath(resolveNoopPath(caller))).toMatch(/\/packages\/ui\/dist\/noop\.js$/)
      expect(normalizePath(resolvePixelReactPath(caller))).toMatch(
        /\/packages\/ui\/dist\/pixel-react\/index\.js$/,
      )
    }
  })

  it('unifyReactAliases replaces Next compiled React paths', () => {
    const real = {
      react: '/app/node_modules/react/index.js',
      reactDom: '/app/node_modules/react-dom/index.js',
      reactDomClient: '/app/node_modules/react-dom/client.js',
      jsxDevRuntime: '/app/node_modules/react/jsx-dev-runtime.js',
      jsxRuntime: '/app/node_modules/react/jsx-runtime.js',
    }

    const alias = {
      react$: '/app/node_modules/next/dist/compiled/react/index.js',
      'react-dom$': '/app/node_modules/next/dist/compiled/react-dom/index.js',
      'react-dom/client$': '/app/node_modules/next/dist/compiled/react-dom/client.js',
      'react/jsx-dev-runtime$': '/app/node_modules/next/dist/compiled/react/jsx-dev-runtime.js',
      'react/jsx-runtime$': '/app/node_modules/next/dist/compiled/react/jsx-runtime.js',
      lodash: '/app/node_modules/lodash/index.js',
    }

    expect(unifyReactAliases(alias, real)).toEqual({
      ...alias,
      react$: real.react,
      'react-dom$': real.reactDom,
      'react-dom/client$': real.reactDomClient,
      'react/jsx-dev-runtime$': real.jsxDevRuntime,
      'react/jsx-runtime$': real.jsxRuntime,
    })
  })
})

const webpackStub = {
  NormalModuleReplacementPlugin: class {
    constructor(
      public pattern: RegExp,
      public handler: (resource: { context: string; request: string }) => void,
    ) {}
  },
}

type StubConfig = {
  tagged?: boolean
  resolve: { alias: Record<string, unknown> }
  plugins: unknown[]
}

/** Drive the composed `webpack()` hook the way Next does, for one compilation. */
function runWebpack(
  config: import('./next').NextConfigLike,
  context: { dev: boolean; isServer: boolean },
): StubConfig {
  const hook = config.webpack as unknown as (
    config: StubConfig,
    context: { dev: boolean; isServer: boolean; webpack: typeof webpackStub },
  ) => StubConfig
  return hook({ resolve: { alias: {} }, plugins: [] }, { ...context, webpack: webpackStub })
}

type NextConfigLike = import('./next').NextConfigLike

describe('withPixel', () => {
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    log.mockRestore()
    vi.unstubAllEnvs()
  })

  it('merges transpilePackages and chains webpack', async () => {
    const { withPixel } = await import('./next')

    const userWebpack = vi.fn((config: { tagged?: boolean }) => {
      config.tagged = true
      return config
    })

    const config = withPixel(
      {
        transpilePackages: ['@acme/shared'],
        webpack: userWebpack,
      } satisfies NextConfigLike,
      { rootDir: process.cwd(), appDir: 'src' },
    )

    expect(config.transpilePackages).toEqual(['@acme/shared', '@getpixel/ui'])

    const result = runWebpack(config, { dev: true, isServer: false })

    expect(userWebpack).toHaveBeenCalledOnce()
    expect(result.tagged).toBe(true)
    expect(result.plugins).toHaveLength(2)
    expect(result.plugins[0]).toBeInstanceOf(webpackStub.NormalModuleReplacementPlugin)
    expect(result.plugins[1]).toBeInstanceOf(webpackStub.NormalModuleReplacementPlugin)
  })

  it('turns reactStrictMode off in development, since it desyncs state capture', async () => {
    const { withPixel } = await import('./next')
    vi.stubEnv('NODE_ENV', 'development')
    expect(withPixel<NextConfigLike>({}, { rootDir: process.cwd() }).reactStrictMode).toBe(false)
  })

  it('keeps reactStrictMode when explicitly opted in', async () => {
    const { withPixel } = await import('./next')
    vi.stubEnv('NODE_ENV', 'development')
    expect(
      withPixel<NextConfigLike>({}, { rootDir: process.cwd(), strictMode: true }).reactStrictMode,
    ).toBe(true)
  })

  it("leaves the app's reactStrictMode alone in production", async () => {
    const { withPixel } = await import('./next')
    vi.stubEnv('NODE_ENV', 'production')
    expect(withPixel({ reactStrictMode: true }, { rootDir: process.cwd() }).reactStrictMode).toBe(
      true,
    )
  })

  it('resolves @getpixel/ui to the inert build in production, on both bundles', async () => {
    const { withPixel } = await import('./next')
    const config = withPixel({}, { rootDir: process.cwd() })

    for (const isServer of [false, true]) {
      const result = runWebpack(config, { dev: false, isServer })
      expect(normalizePath(String(result.resolve.alias['@getpixel/ui$']))).toMatch(/\/noop\.js$/)
    }
  })

  it('does not stub the SDK in development, or when opted out', async () => {
    const { withPixel } = await import('./next')

    const dev = runWebpack(withPixel({}, { rootDir: process.cwd() }), {
      dev: true,
      isServer: false,
    })
    expect(dev.resolve.alias['@getpixel/ui$']).toBeUndefined()

    const optedOut = runWebpack(
      withPixel({}, { rootDir: process.cwd(), stripInProduction: false }),
      { dev: false, isServer: false },
    )
    expect(optedOut.resolve.alias['@getpixel/ui$']).toBeUndefined()
  })
})

describe('vite plugins', () => {
  it('pixelProdStub resolves @getpixel/ui to the inert build, at build time only', async () => {
    const { pixelProdStub } = await import('./vite')
    const plugin = pixelProdStub()

    expect(plugin.apply).toBe('build')
    const resolveId = plugin.resolveId as (source: string) => string | null
    expect(normalizePath(String(resolveId('@getpixel/ui')))).toMatch(/\/noop\.js$/)
    expect(resolveId('@getpixel/ui/pixel-react')).toBeNull()
    expect(resolveId('react')).toBeNull()
  })

  it('pixel() bundles the dev alias and the production stub', async () => {
    const { pixel } = await import('./vite')
    expect(pixel({ rootDir: '/proj', appDir: 'src' }).map((p) => p.name)).toEqual([
      'pixel-react-alias',
      'pixel-prod-stub',
    ])
  })
})