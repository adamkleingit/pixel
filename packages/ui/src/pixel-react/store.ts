/**
 * pixel-react runtime store — the shared, cross-module singleton that the
 * intercepted hooks (in `./index.ts`, aliased as the app's `react`) write to and
 * the provider UI reads from.
 *
 * Two consumers, one instance:
 *   - the app's hooks (aliased `react` → our module) record/inject values here;
 *   - `@getpixel/ui`'s provider (real react) subscribes to the frame list and
 *     drives the mode.
 * Both live in the same package, but the alias means the app imports our module
 * as a *separate* entry (`@getpixel/ui/pixel-react`) from the provider's main
 * entry. A `Symbol.for` on `globalThis` guarantees they see the SAME store even
 * if the two entries land in different chunks (mirrors `session.ts`).
 *
 * Modes (see complete-refactor.md §4 / state-capture.md §5):
 *   - `capture`   — live app. Real hooks run; every hook value is recorded into
 *                   `live`, and a distinct commit is snapshotted into `frames`.
 *   - `suppress`  — frozen view. Hooks return the active frame's captured value;
 *                   effects no-op. Used while time-travelling.
 *   - `restore`   — one-shot: seed the active frame's values as the *initial*
 *                   state of a fresh mount, then flip back to `capture` so the
 *                   app is interactive again (used on cancel, to return to the
 *                   pre-freeze live state and keep monitoring).
 */

export type CaptureMode = 'capture' | 'suppress' | 'restore'

/** Hook slots for one component instance, keyed by hook kind, in call order. */
export interface InstanceSlot {
  state: unknown[]
  refs: unknown[]
  contexts: unknown[]
  /** useSyncExternalStore snapshots (Redux/Zustand/Jotai/TanStack funnel here). */
  stores: unknown[]
}

export type SlotKind = keyof InstanceSlot

/** A captured commit: the whole app's hook state at one point in time. */
export interface Frame {
  id: number
  /** Epoch ms of capture. */
  at: number
  /** instanceKey → its hook slots (values held by reference, per state-capture §3). */
  data: Map<string, InstanceSlot>
}

/** Sentinel for "no captured value at this slot" — distinct from a real `undefined`. */
export const MISSING = Symbol('pixel-missing')

export const MAX_FRAMES = 50

type Listener = () => void

interface Store {
  mode: CaptureMode
  /** The live, continuously-updated state map (capture mode writes here). */
  live: Map<string, InstanceSlot>
  /** Ring buffer of captured commits, oldest → newest, capped at MAX_FRAMES. */
  frames: Frame[]
  /** The frame injected during `suppress` / `restore`, or null. */
  active: Frame | null
  nextFrameId: number
  listeners: Set<Listener>
  /** Debounce handle for commit snapshots. */
  scheduled: number | null
  /** Set while recording since the last snapshot — drives the debounced capture. */
  dirty: boolean
  /** Bumped on every frame-list change — a stable snapshot for useSyncExternalStore. */
  version: number
}

const KEY = Symbol.for('@getpixel/ui.pixelReactStore')
type Host = { [KEY]?: Store }

function store(): Store {
  const h = (typeof globalThis === 'undefined' ? {} : globalThis) as unknown as Host
  if (!h[KEY]) {
    h[KEY] = {
      mode: 'capture',
      live: new Map(),
      frames: [],
      active: null,
      nextFrameId: 1,
      listeners: new Set(),
      scheduled: null,
      dirty: false,
      version: 0,
    }
  }
  return h[KEY]!
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export function getMode(): CaptureMode {
  return store().mode
}

/** Set the injection mode and the frame it should inject (null for capture). */
export function setMode(mode: CaptureMode, active: Frame | null = null): void {
  const s = store()
  s.mode = mode
  s.active = active
}

// ---------------------------------------------------------------------------
// Capture (hooks → store)
// ---------------------------------------------------------------------------

function ensureSlot(map: Map<string, InstanceSlot>, key: string): InstanceSlot {
  let slot = map.get(key)
  if (!slot) {
    slot = { state: [], refs: [], contexts: [], stores: [] }
    map.set(key, slot)
  }
  return slot
}

/**
 * Record a hook's current value into the live map (capture mode). Marks the
 * store dirty and schedules a debounced snapshot so a settled commit becomes a
 * frame.
 */
export function record(key: string, kind: SlotKind, index: number, value: unknown): void {
  const s = store()
  const slot = ensureSlot(s.live, key)
  const prev = slot[kind][index]
  slot[kind][index] = value
  if (!Object.is(prev, value)) {
    s.dirty = true
    schedule()
  }
}

/** Read an injected value for a hook, or MISSING if the active frame lacks it. */
export function inject(key: string, kind: SlotKind, index: number): unknown | typeof MISSING {
  const s = store()
  const slot = s.active?.data.get(key)
  if (!slot) return MISSING
  const arr = slot[kind]
  return index < arr.length ? arr[index] : MISSING
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** Shallow clone of a live-state map — arrays copied, leaf values by reference. */
function cloneState(map: Map<string, InstanceSlot>): Map<string, InstanceSlot> {
  const out = new Map<string, InstanceSlot>()
  for (const [k, slot] of map) {
    out.set(k, {
      state: slot.state.slice(),
      refs: slot.refs.slice(),
      contexts: slot.contexts.slice(),
      stores: slot.stores.slice(),
    })
  }
  return out
}

/** True when two state maps differ in any `state`/`context` slot (refs ignored —
 *  DOM refs churn every mount and aren't meaningful state). */
function statesDiffer(a: Map<string, InstanceSlot>, b: Map<string, InstanceSlot>): boolean {
  if (a.size !== b.size) return true
  for (const [k, sa] of a) {
    const sb = b.get(k)
    if (!sb) return true
    if (
      !arraysEqual(sa.state, sb.state) ||
      !arraysEqual(sa.contexts, sb.contexts) ||
      !arraysEqual(sa.stores, sb.stores)
    )
      return true
  }
  return false
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

/** Snapshot the current live state as a frame, if it differs from the newest one. */
export function snapshot(label?: string): Frame | null {
  const s = store()
  s.dirty = false
  const newest = s.frames[s.frames.length - 1]
  if (newest && !statesDiffer(newest.data, s.live)) return null
  const frame: Frame = {
    id: s.nextFrameId++,
    at: Date.now(),
    data: cloneState(s.live),
  }
  s.frames.push(frame)
  if (s.frames.length > MAX_FRAMES) s.frames.shift()
  notify()
  return frame
}

/** A one-off snapshot of the live state that is NOT pushed to the list — used to
 *  remember the pre-freeze state so cancel can restore it. */
export function captureLive(): Frame {
  const s = store()
  return { id: -1, at: Date.now(), data: cloneState(s.live) }
}

export function getFrames(): Frame[] {
  return store().frames
}

/** A number that changes whenever the frame list changes — for useSyncExternalStore. */
export function getVersion(): number {
  return store().version
}

export function clearFrames(): void {
  const s = store()
  s.frames = []
  notify()
}

// ---------------------------------------------------------------------------
// Commit scheduling (debounce)
// ---------------------------------------------------------------------------

/** In capture mode, coalesce a burst of records from one commit into one frame. */
function schedule(): void {
  const s = store()
  if (s.mode !== 'capture') return // no snapshots while frozen/restoring
  if (s.scheduled != null) return
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16) as unknown as number
  s.scheduled = raf(() => {
    s.scheduled = null
    if (s.mode === 'capture' && s.dirty) snapshot()
  }) as unknown as number
}

// ---------------------------------------------------------------------------
// Subscription (store → provider UI)
// ---------------------------------------------------------------------------

export function subscribe(fn: Listener): () => void {
  const s = store()
  s.listeners.add(fn)
  return () => {
    s.listeners.delete(fn)
  }
}

function notify(): void {
  const s = store()
  s.version++
  for (const fn of s.listeners) fn()
}

/** Test-only: wipe the singleton to a clean state. */
export function __resetStore(): void {
  const s = store()
  s.mode = 'capture'
  s.live = new Map()
  s.frames = []
  s.active = null
  s.nextFrameId = 1
  s.dirty = false
  s.version = 0
  if (s.scheduled != null) s.scheduled = null
  s.listeners.clear()
}
