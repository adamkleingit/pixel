/**
 * PixelStateRoot — wrap your app's content in this (dev only) so pixel-react can
 * remount the subtree for time-travel:
 *
 *   <PixelProvider>
 *     <PixelStateRoot><App /></PixelStateRoot>   // capturable app content
 *     <Overlay />                                // Pixel's own UI — outside
 *   </PixelProvider>
 *
 * It renders its children under a `key` tied to the remount generation
 * (`./control.ts`). Bumping the generation (freeze / goto frame / cancel)
 * remounts the children so every hook re-reads through the current store mode.
 * Keep `<Overlay />` and any other Pixel UI OUTSIDE it — only app content that
 * imports the aliased `react` should be captured and remounted.
 *
 * This component itself uses the REAL React (it lives in `@getpixel/ui`, which is
 * not aliased), so its own hooks are never captured.
 */
import { Fragment, useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { finishRestore, getGen, subscribeGen } from './control'
import { getMode } from './store'

export interface PixelStateRootProps {
  children: ReactNode
  /** When false, renders children untouched with no remount wrapping (production). */
  enabled?: boolean
}

export function PixelStateRoot({ children, enabled = true }: PixelStateRootProps): JSX.Element {
  if (!enabled) return <>{children}</>
  return <PixelStateRootInner>{children}</PixelStateRootInner>
}

function PixelStateRootInner({ children }: { children: ReactNode }): JSX.Element {
  const gen = useSyncExternalStore(subscribeGen, getGen, getGen)

  // After a `restore` remount commits, flip the store back to capture so the app
  // is interactive and monitoring again. Keyed on `gen` so it runs once per
  // remount. Harmless in suppress/capture (the guard skips those).
  useEffect(() => {
    if (getMode() === 'restore') finishRestore()
  }, [gen])

  return <Fragment key={gen}>{children}</Fragment>
}
