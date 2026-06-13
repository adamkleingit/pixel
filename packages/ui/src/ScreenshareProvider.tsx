import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ScreenshareContext,
  type RectFlash,
  type RectShape,
  type ResolvedBarConfig,
  type ScreenshareContextValue,
} from './context'
import { installKeyboard } from './capture/keys'
import { describeElementChain } from './capture/hittest'
import { captureFullFrame, captureRegion } from './capture/snapshot'
import { Recorder } from './recorder'
import { injectStyles } from './styles'
import type { BlipData } from './draw/blip'
import type { Recording, ScreenshareConfig, ScreenshareState } from './types'

/** Movement (px) past which a pointer gesture is a drag-rectangle, not a click. */
const DRAG_THRESHOLD = 6

export interface ScreenshareProviderProps {
  children: React.ReactNode
  config?: ScreenshareConfig
  /** Fires once with the finished recording when recording stops. */
  onComplete?: (rec: Recording) => void
  /** Fires after the recording is successfully persisted by the configured sink. */
  onSaved?: (result: { id: string }) => void
  /** Fires when a recording is cancelled (Esc / cancel button) and discarded. */
  onCancel?: () => void
}

let nextBlipId = 1
let nextFlashId = 1

function rectFrom(x0: number, y0: number, x1: number, y1: number): RectShape {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

export function ScreenshareProvider({
  children,
  config = {},
  onComplete,
  onSaved,
  onCancel,
}: ScreenshareProviderProps) {
  const [state, setState] = useState<ScreenshareState>('idle')
  const [lastRecording, setLastRecording] = useState<Recording | null>(null)
  const [blips, setBlips] = useState<BlipData[]>([])
  const [dragRect, setDragRect] = useState<RectShape | null>(null)
  const [rectFlashes, setRectFlashes] = useState<RectFlash[]>([])
  // Interaction mode is SDK-owned runtime state (initial from config) so it can be
  // toggled live — including mid-recording — from the floating bar.
  const [passthrough, setPassthrough] = useState(config.passthrough === true)

  const recorderRef = useRef<Recorder | null>(null)

  // Live state mirror so stable callbacks and the key listener read current state.
  const stateRef = useRef(state)
  stateRef.current = state

  // Keep the latest config/callbacks in refs so the stable `toggle` closure and
  // the double-tap listener always see current values.
  const configRef = useRef(config)
  configRef.current = config
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => injectStyles(), [])

  // Full-viewport screenshot (with coordinate grid) on start and resume.
  const captureFrame = useCallback(async (reason: 'start' | 'resume') => {
    const recorder = recorderRef.current
    if (!recorder) return
    const res = await captureFullFrame()
    if (!res || recorderRef.current !== recorder) return
    const name = `frame-${reason}-${Math.round(recorder.clock())}.png`
    recorder.addSnapshot(name, res.blob)
    recorder.frame(reason, name, res.width, res.height)
  }, [])

  const start = useCallback(async () => {
    if (recorderRef.current) return
    const cfg = configRef.current
    const recorder = new Recorder({ pointerHz: cfg.pointerHz })
    recorderRef.current = recorder
    setState('recording')
    await recorder.start({ audio: cfg.audio !== false })
    void captureFrame('start')
  }, [captureFrame])

  const stop = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return

    // Keep capturing a beat longer — people click stop a touch early and clip
    // their last words. State stays 'recording' during the tail so audio + events
    // keep flowing. If paused, resume first so the tail is actually captured.
    const delay = configRef.current.stopDelayMs ?? 500
    if (delay > 0) {
      if (stateRef.current === 'paused') {
        recorder.resume()
        setState('recording')
      }
      await new Promise((r) => setTimeout(r, delay))
      // A cancel() during the tail swaps/clears the recorder — bail if so.
      if (recorderRef.current !== recorder) return
    }

    recorderRef.current = null
    const recording = await recorder.stop()
    recording.language = configRef.current.language
    setState('idle')
    setBlips([])
    setRectFlashes([])
    setDragRect(null)
    setLastRecording(recording)
    onCompleteRef.current?.(recording)

    const sink = configRef.current.sink
    if (sink) {
      try {
        const result = await sink.save(recording)
        recording.id = result.id
        onSavedRef.current?.(result)
      } catch (err) {
        console.error('[screenshare] failed to save recording:', err)
      }
    }
  }, [])

  const pause = useCallback(() => {
    if (stateRef.current !== 'recording') return
    recorderRef.current?.pause()
    setState('paused')
    setDragRect(null)
  }, [])

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return
    recorderRef.current?.resume()
    setState('recording')
    void captureFrame('resume')
  }, [captureFrame])

  const cancel = useCallback(() => {
    if (!recorderRef.current) return
    recorderRef.current.abort()
    recorderRef.current = null
    setState('idle')
    setBlips([])
    setRectFlashes([])
    setDragRect(null)
    onCancelRef.current?.()
  }, [])

  const toggle = useCallback(() => {
    if (stateRef.current === 'idle') void start()
    else void stop()
  }, [start, stop])

  const removeBlip = useCallback((id: number) => {
    setBlips((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const removeRectFlash = useCallback((id: number) => {
    setRectFlashes((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // Keyboard: double-tap to start/stop, single tap to pause/resume, Esc to cancel.
  useEffect(() => {
    if (config.activation?.enabled === false) return
    return installKeyboard(config.activation, {
      onDouble: () => {
        if (stateRef.current === 'idle') void start()
        else void stop()
      },
      onSingle: () => {
        if (stateRef.current === 'recording') pause()
        else if (stateRef.current === 'paused') resume()
      },
      onEscape: () => {
        if (stateRef.current !== 'idle') cancel()
      },
    })
  }, [config.activation, start, stop, pause, resume, cancel])

  // While recording (not paused), capture pointer movement, clicks, and drag
  // rectangles. In block mode (default) we also stop page clicks/typing from
  // reaching the app; in passthrough mode the page stays interactive. Pausing
  // tears this down (the effect is gated on state==='recording'), so the page is
  // fully live while paused and the mode reapplies on resume. Re-runs when
  // `passthrough` is toggled mid-recording, instantly swapping block/passthrough.
  useEffect(() => {
    if (state !== 'recording') return
    const block = !passthrough
    const activationKey = configRef.current.activation?.key ?? 'Space'

    // Events targeting our own overlay/control bar must never be blocked or
    // recorded as page interactions.
    const isOwnUI = (e: Event): boolean => {
      const t = e.target
      return t instanceof Element && !!t.closest('.screenshare-overlay')
    }

    let drag: { x: number; y: number; startT: number; moved: boolean } | null = null

    const onMove = (e: PointerEvent) => {
      if (isOwnUI(e)) return
      if (block) e.preventDefault()
      recorderRef.current?.samplePointer(e.clientX, e.clientY)
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      setDragRect(rectFrom(drag.x, drag.y, e.clientX, e.clientY))
    }

    const onDown = (e: PointerEvent) => {
      if (isOwnUI(e)) return
      if (block) {
        e.preventDefault()
        e.stopPropagation()
      }
      const rec = recorderRef.current
      if (!rec) return
      drag = { x: e.clientX, y: e.clientY, startT: rec.clock(), moved: false }
    }

    const onUp = (e: PointerEvent) => {
      if (isOwnUI(e)) return
      if (block) {
        e.preventDefault()
        e.stopPropagation()
      }
      const rec = recorderRef.current
      const d = drag
      drag = null
      if (!rec || !d) return

      if (!d.moved) {
        // A click: record the target element chain + show a radar blip.
        const target = describeElementChain(e.clientX, e.clientY)
        rec.click(e.clientX, e.clientY, e.button, target)
        setBlips((prev) => [...prev, { id: nextBlipId++, x: e.clientX, y: e.clientY }])
        return
      }

      // A drag: record the rectangle, flash it, and grab a region screenshot.
      const r = rectFrom(d.x, d.y, e.clientX, e.clientY)
      setDragRect(null)
      if (r.width < 2 || r.height < 2) return
      const ev = rec.rect({ startT: d.startT, ...r })
      setRectFlashes((prev) => [...prev, { id: nextFlashId++, ...r }])

      const name = `snap-${Math.round(d.startT)}.png`
      ev.snapshot = name
      void captureRegion(r).then((blob) => {
        if (blob) rec.addSnapshot(name, blob)
        else ev.snapshot = undefined
      })
    }

    const onCancel = () => {
      drag = null
      setDragRect(null)
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)

    // Block-mode-only: swallow the page's click/typing so the app doesn't react.
    const swallow = (e: Event) => {
      if (isOwnUI(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const swallowKey = (e: KeyboardEvent) => {
      if (isOwnUI(e)) return
      // Let our shortcuts through (handled by installKeyboard).
      if (e.code === activationKey || e.code === 'Escape') return
      e.preventDefault()
      e.stopPropagation()
    }
    const pageMouseEvents = ['click', 'dblclick', 'auxclick', 'mousedown', 'mouseup', 'contextmenu']
    const pageKeyEvents = ['keydown', 'keypress', 'beforeinput']
    if (block) {
      for (const t of pageMouseEvents) window.addEventListener(t, swallow, true)
      for (const t of pageKeyEvents) window.addEventListener(t, swallowKey as EventListener, true)
      // Drop focus from any page input so keystrokes don't reach it.
      const active = document.activeElement as HTMLElement | null
      if (active && !active.closest('.screenshare-overlay')) active.blur?.()
    }

    return () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      for (const t of pageMouseEvents) window.removeEventListener(t, swallow, true)
      for (const t of pageKeyEvents) window.removeEventListener(t, swallowKey as EventListener, true)
      setDragRect(null)
    }
  }, [state, passthrough])

  const bar = useMemo<ResolvedBarConfig>(
    () => ({
      always: config.bar?.always ?? false,
      position: config.bar?.position ?? 'center-right',
      opacity: config.bar?.opacity ?? 0.3,
    }),
    [config.bar?.always, config.bar?.position, config.bar?.opacity],
  )

  const value = useMemo<ScreenshareContextValue>(
    () => ({
      state,
      start: () => void start(),
      stop: () => void stop(),
      pause,
      resume,
      cancel,
      toggle,
      passthrough,
      setPassthrough,
      bar,
      lastRecording,
      blips,
      removeBlip,
      dragRect,
      rectFlashes,
      removeRectFlash,
    }),
    [state, start, stop, pause, resume, cancel, toggle, passthrough, bar, lastRecording, blips, removeBlip, dragRect, rectFlashes, removeRectFlash],
  )

  return <ScreenshareContext.Provider value={value}>{children}</ScreenshareContext.Provider>
}
