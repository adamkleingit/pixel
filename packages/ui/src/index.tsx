export { PixelProvider } from './PixelProvider'
export type { PixelProviderProps } from './PixelProvider'
export { Overlay } from './Overlay'
export type { OverlayProps } from './Overlay'
export { usePixel } from './usePixel'
export type { UsePixel } from './usePixel'
export { PixelStateRoot } from './pixel-react/PixelStateRoot'
export type { PixelStateRootProps } from './pixel-react/PixelStateRoot'
export { httpSink, DEFAULT_SERVER_URL } from './sinks/httpSink'
export { installHmrGuard, shouldDeferHmr, type HotContext } from './hmr-guard'

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
} from './types'
