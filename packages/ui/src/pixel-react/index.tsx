/**
 * pixel-react — a thin wrapper around React that the *app* imports in place of
 * `react` (via a dev-only bundler alias; see the example's vite.config.ts and
 * the README). All non-hook exports pass through to the real React; the stateful
 * hooks are overridden so pixel-react can, per mode (`./store.ts`):
 *
 *   - **capture** (default, live app): run the real hook, then record its value
 *     into the shared store keyed by the rendering instance (`./fiber.ts`). The
 *     app behaves exactly as normal.
 *   - **suppress** (frozen / time-travelling): return the active frame's captured
 *     value instead of live state, and no-op every effect — the tree renders the
 *     historical state and doesn't re-run side effects.
 *   - **restore** (one-shot on cancel): seed the captured values as the *initial*
 *     state of a fresh mount, then the provider flips back to capture — so the
 *     app returns to its pre-freeze state and keeps monitoring, interactive.
 *
 * Only the app's own modules are aliased; `@getpixel/ui` and `react-dom` keep the
 * real React (the alias excludes node_modules), so there is a single React
 * runtime and Pixel's own UI is never captured. **Do not use React.StrictMode**
 * around aliased code: its double-invoke re-runs a component's hooks against the
 * same fiber, which desyncs the per-render hook cursor (see the README).
 */
import * as React from 'react'
import { currentFiber, instanceKey } from './fiber'
import { getMode, inject, MISSING, record, type SlotKind } from './store'

// Re-export the real React's non-hook (and pure-hook) surface explicitly.
// React ships as CJS, so `export *` warns and can drop exports.
export {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useId,
  useMemo,
  useTransition,
  version,
} from 'react'

// ---------------------------------------------------------------------------
// Per-render hook cursor
// ---------------------------------------------------------------------------
// React runs a component's hooks in order within one render pass. We detect the
// pass boundary by the rendering fiber's identity changing, and reset a per-kind
// cursor there. Capture and replay run the same component code in the same
// order, so the (instanceKey, kind, index) triple lines up between them.

let lastFiber: unknown = Symbol('none')
let curKey = '@root'
const cursor = { state: 0, refs: 0, contexts: 0, stores: 0 }

function begin(kind: SlotKind): { key: string; index: number } {
  const f = currentFiber()
  if (f !== lastFiber) {
    lastFiber = f
    curKey = instanceKey(f)
    cursor.state = 0
    cursor.refs = 0
    cursor.contexts = 0
    cursor.stores = 0
  }
  return { key: curKey, index: cursor[kind]++ }
}

function resolveInit<T>(init: T | (() => T)): T {
  return typeof init === 'function' ? (init as () => T)() : init
}

// ---------------------------------------------------------------------------
// Overridden stateful hooks
// ---------------------------------------------------------------------------

export function useState<T>(
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const { key, index } = begin('state')
  const mode = getMode()

  if (mode === 'suppress') {
    const injected = inject(key, 'state', index)
    const [live, setLive] = React.useState(initial)
    return [injected === MISSING ? live : (injected as T), setLive]
  }

  if (mode === 'restore') {
    const injected = inject(key, 'state', index)
    const [v, setV] = React.useState<T>(() =>
      injected === MISSING ? resolveInit(initial) : (injected as T),
    )
    record(key, 'state', index, v)
    return [v, setV]
  }

  const [v, setV] = React.useState(initial)
  record(key, 'state', index, v)
  return [v, setV]
}

export function useReducer<R extends React.Reducer<unknown, unknown>>(
  reducer: R,
  initialArg: unknown,
  init?: (arg: unknown) => unknown,
): [React.ReducerState<R>, React.Dispatch<React.ReducerAction<R>>] {
  const { key, index } = begin('state')
  const mode = getMode()
  const injected = mode === 'capture' ? MISSING : inject(key, 'state', index)

  // Seed the reducer's initial state from the injected value when replaying.
  const seed = () => (injected === MISSING ? (init ? init(initialArg) : initialArg) : injected)
  const [live, dispatch] = React.useReducer(reducer, undefined as never, seed as never)

  if (mode === 'suppress') {
    return [injected === MISSING ? live : (injected as React.ReducerState<R>), dispatch]
  }
  record(key, 'state', index, live)
  return [live as React.ReducerState<R>, dispatch]
}

export function useRef<T>(initial: T): React.MutableRefObject<T> {
  const { key, index } = begin('refs')
  const ref = React.useRef(initial)
  // DOM-valued refs regenerate every mount, so we never inject them — we just
  // record the current value for inspection. Non-DOM refs are recorded too.
  if (getMode() === 'capture') record(key, 'refs', index, ref.current)
  return ref
}

export function useContext<T>(context: React.Context<T>): T {
  // Pass through — do NOT capture/inject context. Two reasons:
  //  1. On replay the app remounts UNDER the still-mounted provider tree (app
  //     providers below the boundary remount too, deriving from injected state),
  //     so live context is already the correct value — nothing to inject.
  //  2. A provider whose value object changes identity every render (e.g. Pixel's
  //     own context, which carries the frame list) would otherwise record a fresh
  //     value each commit → a new frame → a re-render → an infinite capture loop.
  return React.useContext(context)
}

export function useSyncExternalStore<T>(
  subscribe: (onChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  const { key, index } = begin('stores')
  const mode = getMode()
  if (mode === 'capture') {
    const snap = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    record(key, 'stores', index, snap)
    return snap
  }
  // Frozen: ignore the live store; a no-op subscription keeps the hook shape.
  const injected = inject(key, 'stores', index)
  const snap = React.useSyncExternalStore(
    () => () => {},
    getSnapshot,
    getServerSnapshot,
  )
  return injected === MISSING ? snap : (injected as T)
}

// ---------------------------------------------------------------------------
// Effect hooks — no-op while frozen (the frame is post-effect, so re-running
// would only re-fetch / clobber). Real in capture and restore.
// ---------------------------------------------------------------------------

const NOOP_EFFECT = () => {}

export function useEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {
  React.useEffect(getMode() === 'suppress' ? NOOP_EFFECT : effect, deps)
}

export function useLayoutEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {
  React.useLayoutEffect(getMode() === 'suppress' ? NOOP_EFFECT : effect, deps)
}

export function useInsertionEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {
  React.useInsertionEffect(getMode() === 'suppress' ? NOOP_EFFECT : effect, deps)
}

export function useImperativeHandle<T, R extends T>(
  ref: React.Ref<T> | undefined,
  create: () => R,
  deps?: React.DependencyList,
): void {
  React.useImperativeHandle(ref, getMode() === 'suppress' ? (() => ({}) as R) : create, deps)
}

// A default export mirroring React's, with our hook overrides layered on, for
// code that does `import React from 'react'; React.useState(...)`.
const _default = {
  ...(React as unknown as Record<string, unknown>),
  useState,
  useReducer,
  useRef,
  useContext,
  useSyncExternalStore,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useImperativeHandle,
}
export default _default
