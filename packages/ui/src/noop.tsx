/**
 * Inert build of the public API, for production bundles.
 *
 * `isEnabled={false}` makes the provider inert at *runtime*, but the import is
 * still a static one: the bundler has no way to know the flag is constant, so
 * the whole SDK — the overlay, the recorder, html-to-image — stays reachable
 * and ships. `sideEffects: false` doesn't help either, because the JSX
 * references are live code.
 *
 * This module has the same exports and the same shapes, and does nothing. Point
 * `@getpixel/ui` at it for production builds and the SDK drops out of the graph
 * entirely while the app keeps compiling and rendering unchanged. The bundled
 * integrations (`@getpixel/ui/vite`, `@getpixel/ui/next`) wire that swap up for
 * you; see the README for the manual equivalent.
 *
 * Nothing here may import SDK runtime code — only `import type`, which erases.
 */
import type { ReactNode } from 'react'
import type { PixelProviderProps } from './PixelProvider'
import type { OverlayProps } from './Overlay'
import type { PixelStateRootProps } from './pixel-react/PixelStateRoot'
import type { UsePixel } from './usePixel'
import type { HotContext } from './hmr-guard'
import type { RecordingSink } from './types'

export function PixelProvider({ children }: PixelProviderProps): ReactNode {
  return <>{children}</>
}

export function Overlay(_props: OverlayProps = {}): ReactNode {
  return null
}

export function PixelStateRoot({ children }: PixelStateRootProps): ReactNode {
  return <>{children}</>
}

const noop = (): void => {}

/** Frozen so consumers can depend on it the way they depend on the real hook's identity. */
const INERT: UsePixel = Object.freeze({
  state: 'idle',
  start: noop,
  stop: noop,
  pause: noop,
  resume: noop,
  cancel: noop,
  toggle: noop,
  editing: false,
  enterEdit: noop,
  exitEdit: noop,
  toggleEdit: noop,
  passthrough: false,
  setPassthrough: noop,
  lastRecording: null,
  saveError: null,
  saving: false,
  resend: noop,
})

export function usePixel(): UsePixel {
  return INERT
}

export const DEFAULT_SERVER_URL = 'http://localhost:41789'

export function httpSink(_baseUrl?: string): RecordingSink {
  return {
    async listTasks() {
      return []
    },
    async openTask() {},
    async fetchTokens() {
      return { tokens: [] }
    },
    async save() {
      return { id: '' }
    },
    async saveEdits() {
      return { id: '' }
    },
    async saveComments() {
      return { id: '' }
    },
  }
}

export function installHmrGuard(_hot?: HotContext | null | false): void {}

export function shouldDeferHmr(): boolean {
  return false
}

export type { PixelProviderProps } from './PixelProvider'
export type { OverlayProps } from './Overlay'
export type { PixelStateRootProps } from './pixel-react/PixelStateRoot'
export type { UsePixel } from './usePixel'
export type { HotContext } from './hmr-guard'
export type {
  Recording,
  PixelEvent,
  PointerSample,
  ClickEvent,
  RectEvent,
  FrameEvent,
  ElementInfo,
  AudioTrack,
  SnapshotBlob,
  PixelState,
  PixelConfig,
  ActivationConfig,
  BarConfig,
  BarPosition,
  BugReportConfig,
  RecordingSink,
  Task,
  TaskStatus,
  EditPayload,
  EditChangeRecord,
  CommentPayload,
  CommentRecord,
} from './types'
