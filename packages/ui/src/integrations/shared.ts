import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ReactAliasMap = Record<string, string | false | string[]>

export interface ResolveAppSourceOptions {
  /** Project root (where package.json lives). Defaults to `process.cwd()`. */
  rootDir?: string
  /** App source dir(s), relative to `rootDir` unless absolute. Default: `'src'`. */
  appDir?: string | string[]
}

/** Normalize paths for stable substring checks on Windows and POSIX. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/** Resolve absolute app-source roots used to scope the pixel-react alias. */
export function resolveAppSourcePaths(options: ResolveAppSourceOptions = {}): string[] {
  const rootDir = options.rootDir ?? process.cwd()
  const appDirs = options.appDir ?? 'src'
  const dirs = Array.isArray(appDirs) ? appDirs : [appDirs]

  return dirs.map((dir) => {
    const candidate = isAbsolute(dir) ? dir : resolve(rootDir, dir)
    return normalizePath(candidate)
  })
}

/** True when a webpack module context is under one of the configured app roots. */
export function isAppSource(context: string, appSourcePaths: string[]): boolean {
  const ctx = normalizePath(context)
  return appSourcePaths.some((root) => ctx.includes(root))
}

/** Skip aliasing react inside pixel-react and the Pixel SDK bundle itself. */
export function shouldSkipReactReplacement(context: string): boolean {
  const ctx = normalizePath(context)
  if (ctx.includes('@getpixel/ui/dist/pixel-react')) return true
  if (ctx.includes('@getpixel/ui/dist') && !ctx.includes('pixel-react')) return true
  return false
}

/** True when app source should route hook imports through pixel-react. */
export function shouldAliasPixelReact(context: string, appSourcePaths: string[]): boolean {
  if (shouldSkipReactReplacement(context)) return false
  return isAppSource(context, appSourcePaths)
}

/** Next SWC may import hooks from compiled/react while other imports use `react`. */
export const COMPILED_REACT_MODULE = /next[\\/]dist[\\/]compiled[\\/]react[\\/]index\.js$/

/** Point Next's compiled React aliases at the app's real React in dev. */
export function unifyReactAliases(alias: ReactAliasMap, realReactPaths: RealReactPaths): ReactAliasMap {
  const next: ReactAliasMap = { ...alias }
  for (const [key, value] of Object.entries(alias)) {
    if (typeof value !== 'string' || !value.includes('next/dist/compiled')) continue
    if (key.includes('jsx-dev-runtime')) next[key] = realReactPaths.jsxDevRuntime
    else if (key.includes('jsx-runtime')) next[key] = realReactPaths.jsxRuntime
    else if (key === 'react-dom/client$' || key.includes('react-dom/client')) {
      next[key] = realReactPaths.reactDomClient
    } else if (key.startsWith('react-dom')) next[key] = realReactPaths.reactDom
    else if (key.startsWith('react')) next[key] = realReactPaths.react
  }
  return next
}

export interface RealReactPaths {
  react: string
  reactDom: string
  reactDomClient: string
  jsxDevRuntime: string
  jsxRuntime: string
}

/** Resolve the app's real React install (used by pixel-react and Next alias unification). */
export function resolveRealReactPaths(rootDir: string): RealReactPaths {
  const requireFromRoot = createRequire(join(rootDir, 'package.json'))
  return {
    react: requireFromRoot.resolve('react'),
    reactDom: requireFromRoot.resolve('react-dom'),
    reactDomClient: requireFromRoot.resolve('react-dom/client'),
    jsxDevRuntime: requireFromRoot.resolve('react/jsx-dev-runtime'),
    jsxRuntime: requireFromRoot.resolve('react/jsx-runtime'),
  }
}

/** Absolute path to the built pixel-react entry inside this package. */
export function resolvePixelReactPath(fromModuleUrl: string = import.meta.url): string {
  const integrationsDir = dirname(fileURLToPath(fromModuleUrl))
  return join(integrationsDir, '../pixel-react/index.js')
}

export const PIXEL_UI_PACKAGE = '@getpixel/ui'
