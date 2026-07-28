import { describe, expect, it, vi } from 'vitest'
import {
  COMPILED_REACT_MODULE,
  isAppSource,
  normalizePath,
  resolveAppSourcePaths,
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

describe('withPixel', () => {
  it('merges transpilePackages and chains webpack', async () => {
    const { withPixel } = await import('./next')
    type NextConfigLike = import('./next').NextConfigLike

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

    const webpack = {
      NormalModuleReplacementPlugin: class {
        constructor(
          public pattern: RegExp,
          public handler: (resource: { context: string; request: string }) => void,
        ) {}
      },
    }

    const baseConfig: { tagged?: boolean; resolve: { alias: Record<string, unknown> }; plugins: unknown[] } = {
      resolve: { alias: {} },
      plugins: [],
    }
    const webpackHook = config.webpack as unknown as (
      config: typeof baseConfig,
      context: { dev: boolean; isServer: boolean; webpack: typeof webpack },
    ) => typeof baseConfig
    const result = webpackHook(baseConfig, {
      dev: true,
      isServer: false,
      webpack,
    })

    expect(userWebpack).toHaveBeenCalledOnce()
    expect((result as { tagged?: boolean }).tagged).toBe(true)
    expect(result.plugins).toHaveLength(2)
    expect(result.plugins[0]).toBeInstanceOf(webpack.NormalModuleReplacementPlugin)
    expect(result.plugins[1]).toBeInstanceOf(webpack.NormalModuleReplacementPlugin)
  })
})