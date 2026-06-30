import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ScreenshareContext,
  type RectFlash,
  type RectShape,
  type ResolvedBarConfig,
  type ScreenshareContextValue,
  type Stroke,
  type StrokeShape,
} from './context'
import { installKeyboard } from './capture/keys'
import { describeElementChain } from './capture/hittest'
import { requestEditCancel, requestEditSave } from './edit/edit-actions'
import { captureFullFrame, captureRegion, captureStroke } from './capture/snapshot'
import { Recorder } from './recorder'
import {
  clearActiveSession,
  getActiveSession,
  setActiveSession,
  updateActiveSession,
} from './session'
import { injectStyles } from './styles'
import type { BlipData } from './draw/blip'
import type { EditPayload, Recording, ScreenshareConfig, ScreenshareState, StrokePoint, Task } from './types'

/** Movement (px) past which a pointer gesture is a drag-rectangle, not a click. */
const DRAG_THRESHOLD = 6

/** Keyboard shortcut (KeyboardEvent.code) that toggles the mouse tool while recording. */
const MOUSE_TOOL_KEY = 'KeyM'

/** True when focus is in a text field — keystrokes there must not trigger shortcuts. */
function isEditableTarget(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export interface ScreenshareProviderProps {
  children: React.ReactNode
  config?: ScreenshareConfig
  /**
   * Master switch. When `false`, the provider is fully inert — no styles, no
   * keyboard shortcuts, no event capture, and `start()` is a no-op — so Pixel
   * adds nothing in production. Gate it on your bundler's dev flag (see README).
   * Default `true`.
   */
  isEnabled?: boolean
  /** Fires once with the finished recording when recording stops. */
  onComplete?: (rec: Recording) => void
  /** Fires after the recording is successfully persisted by the configured sink. */
  onSaved?: (result: { id: string }) => void
  /** Fires when a recording is cancelled (Esc / cancel button) and discarded. */
  onCancel?: () => void
}

let nextBlipId = 1
let nextFlashId = 1
let nextStrokeId = 1

/** Axis-aligned bounding box of a set of points. */
function boundsOf(points: { x: number; y: number }[]): RectShape {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

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
  isEnabled = true,
  onComplete,
  onSaved,
  onCancel,
}: ScreenshareProviderProps) {
  // Adopt any recording already in flight (a remount within the same document —
  // e.g. a Storybook story switch — parks it on a globalThis singleton). On the
  // normal first mount the session is empty and these fall back to defaults.
  const adopted = getActiveSession()

  const [state, setState] = useState<ScreenshareState>(() => adopted?.state ?? 'idle')
  const [lastRecording, setLastRecording] = useState<Recording | null>(null)
  const [blips, setBlips] = useState<BlipData[]>([])
  const [dragRect, setDragRect] = useState<RectShape | null>(null)
  const [rectFlashes, setRectFlashes] = useState<RectFlash[]>([])
  const [drawStroke, setDrawStroke] = useState<StrokeShape | null>(null)
  const [drawStrokes, setDrawStrokes] = useState<Stroke[]>([])
  // Interaction mode is SDK-owned runtime state (initial from config) so it can be
  // toggled live — including mid-recording — from the floating bar. Restored from
  // the adopted session so the mode carries across a remount.
  const [passthrough, setPassthroughState] = useState(
    () => adopted?.passthrough ?? config.passthrough === true,
  )
  // Save status, so the overlay can surface a failure and offer a resend.
  const [saveError, setSaveError] = useState<string | null>(() => adopted?.saveError ?? null)
  const [saving, setSaving] = useState(false)
  // Task status polled from the sink, driving the floating-bar indicator.
  const [tasks, setTasks] = useState<Task[]>([])
  const [serverDown, setServerDown] = useState(false)

  // Adopt the in-flight recorder if there is one; otherwise start null. useRef's
  // initializer only runs on first render, so this is the adoption hook.
  const recorderRef = useRef<Recorder | null>(adopted?.recorder ?? null)
  // The recording awaiting a (re)send after a failed save, if any.
  const pendingRef = useRef<Recording | null>(adopted?.pending ?? null)

  // Mirror passthrough so stable callbacks (start, the M-key toggle) read it
  // without re-creating, and so we can write it through to the session.
  const passthroughRef = useRef(passthrough)
  passthroughRef.current = passthrough

  // Passthrough setter that also writes through to the session (a no-op when no
  // recording is in flight), so the mode survives a remount.
  const setPassthrough = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as (prev: boolean) => boolean)(passthroughRef.current) : v
    passthroughRef.current = next
    setPassthroughState(next)
    updateActiveSession({ passthrough: next })
  }, [])

  // Edit mode — orthogonal to recording `state` (§4.3): both can be on at once,
  // and both belong to one session. v1 just owns the flag + entry/exit; the
  // edit engine and combined Save batch land in later steps.
  const [editing, setEditing] = useState(false)

  // Live state mirror so stable callbacks and the key listener read current state.
  const stateRef = useRef(state)
  stateRef.current = state
  const editingRef = useRef(editing)
  editingRef.current = editing

  // Keep the latest config/callbacks in refs so the stable `toggle` closure and
  // the double-tap listener always see current values.
  const configRef = useRef(config)
  configRef.current = config
  const enabledRef = useRef(isEnabled)
  enabledRef.current = isEnabled
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (isEnabled) injectStyles()
  }, [isEnabled])

  // Poll the sink for task status so the floating bar can show how many
  // recordings are pending/executing, and flag the server as down when the poll
  // fails. Reads the sink from configRef so a re-created sink object (common when
  // config is an inline literal) doesn't thrash the interval.
  const canPoll = Boolean(config.sink?.listTasks)
  useEffect(() => {
    const pollMs = configRef.current.taskPollMs ?? 4000
    if (!isEnabled || !canPoll || pollMs <= 0) return
    let cancelled = false
    let inFlight = false
    const poll = async () => {
      if (inFlight) return // skip if the previous poll hasn't settled (slow server)
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const next = await configRef.current.sink!.listTasks!()
        if (cancelled) return
        setTasks(next)
        setServerDown(false)
      } catch {
        if (!cancelled) setServerDown(true)
      } finally {
        inFlight = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isEnabled, canPoll, config.taskPollMs])

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

  /**
   * Send a finished recording to the configured sink. On failure it keeps the
   * recording around (pendingRef) and exposes a message so the overlay can offer
   * a resend — recordings are never silently lost when the server is down.
   */
  const saveRecording = useCallback(async (recording: Recording) => {
    const sink = configRef.current.sink
    if (!sink) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await sink.save(recording)
      recording.id = result.id
      pendingRef.current = null
      updateActiveSession({ pending: null, saveError: null })
      setLastRecording({ ...recording })
      onSavedRef.current?.(result)
    } catch (err) {
      const message =
        "Couldn't send the recording — is the Pixel server running? Click resend to try again."
      pendingRef.current = recording
      updateActiveSession({ pending: recording, saveError: message })
      setSaveError(message)
      console.error('[screenshare] failed to save recording:', err)
    } finally {
      setSaving(false)
    }
  }, [])

  /** Re-attempt sending the recording that last failed to save. */
  const resend = useCallback(() => {
    const rec = pendingRef.current
    if (rec) void saveRecording(rec)
  }, [saveRecording])

  /**
   * Persist a batch of edit-mode changes via the sink (Save). Resolves with the
   * created task id; rejects (surfacing a message) so the caller can keep the
   * user in edit mode and let them retry. Mirrors `saveRecording`, but edits are
   * stateless — there's no pending-resend buffer.
   */
  const saveEdits = useCallback(async (payload: EditPayload): Promise<{ id: string }> => {
    const sink = configRef.current.sink
    if (!sink?.saveEdits) {
      throw new Error('No sink configured to save edits.')
    }
    setSaving(true)
    setSaveError(null)
    try {
      return await sink.saveEdits(payload)
    } catch (err) {
      const message = "Couldn't save your edits — is the Pixel server running?"
      setSaveError(message)
      console.error('[screenshare] failed to save edits:', err)
      throw err
    } finally {
      setSaving(false)
    }
  }, [])

  /** Ask the sink (server) to open a recording's folder in the OS file manager. */
  const openTask = useCallback((id: string) => {
    configRef.current.sink?.openTask?.(id)?.catch(() => {
      /* best-effort; the bar already surfaces server-down via polling */
    })
  }, [])

  const start = useCallback(async () => {
    // The recorderRef guard also prevents a double-start right after adoption:
    // an adopted provider already holds the in-flight recorder.
    if (!enabledRef.current || recorderRef.current) return
    const cfg = configRef.current
    const recorder = new Recorder({ pointerHz: cfg.pointerHz })
    recorderRef.current = recorder
    // A new recording supersedes any prior failed-save state.
    pendingRef.current = null
    setSaveError(null)
    setState('recording')
    // Park the live session so it survives a provider remount.
    setActiveSession({
      recorder,
      state: 'recording',
      passthrough: passthroughRef.current,
      pending: null,
      saveError: null,
    })
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
    // The recording is over — the session no longer needs to survive remounts.
    clearActiveSession()
    recording.language = configRef.current.language
    setState('idle')
    setBlips([])
    setRectFlashes([])
    setDragRect(null)
    setDrawStroke(null)
    setDrawStrokes([])
    setLastRecording(recording)
    onCompleteRef.current?.(recording)

    await saveRecording(recording)
  }, [saveRecording])

  const pause = useCallback(() => {
    if (stateRef.current !== 'recording') return
    recorderRef.current?.pause()
    setState('paused')
    updateActiveSession({ state: 'paused' })
    setDragRect(null)
    setDrawStroke(null)
  }, [])

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return
    recorderRef.current?.resume()
    setState('recording')
    updateActiveSession({ state: 'recording' })
    void captureFrame('resume')
  }, [captureFrame])

  const cancel = useCallback(() => {
    if (!recorderRef.current) return
    recorderRef.current.abort()
    recorderRef.current = null
    clearActiveSession()
    setState('idle')
    setBlips([])
    setRectFlashes([])
    setDragRect(null)
    setDrawStroke(null)
    setDrawStrokes([])
    onCancelRef.current?.()
  }, [])

  const toggle = useCallback(() => {
    if (stateRef.current === 'idle') void start()
    else void stop()
  }, [start, stop])

  // Entering edit is gated on `isEnabled` so a disabled SDK stays fully inert;
  // exiting is always allowed (turning the session off is safe).
  const enterEdit = useCallback(() => {
    if (enabledRef.current) setEditing(true)
  }, [])
  const exitEdit = useCallback(() => setEditing(false), [])
  const toggleEdit = useCallback(() => {
    if (!enabledRef.current) return
    setEditing((e) => !e)
  }, [])

  const removeBlip = useCallback((id: number) => {
    setBlips((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const removeRectFlash = useCallback((id: number) => {
    setRectFlashes((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // Keyboard: double-tap to start/stop, single tap to pause/resume, Esc to cancel.
  useEffect(() => {
    if (!isEnabled || config.activation?.enabled === false) return
    return installKeyboard(config.activation, {
      onDouble: () => {
        if (stateRef.current === 'idle') void start()
        else void stop()
      },
      onSingle: () => {
        if (stateRef.current === 'recording') pause()
        else if (stateRef.current === 'paused') resume()
      },
      // Esc while editing → Cancel (discard + exit); the Selection layer handles
      // the first Esc (clear selection) and stops propagation, so this fires only
      // once nothing is selected. Otherwise Esc cancels a recording.
      onEscape: () => {
        if (editingRef.current) requestEditCancel()
        else if (stateRef.current !== 'idle') cancel()
      },
      // Double-Enter enters edit mode when not editing; once editing, it Saves.
      onEditDouble: () => {
        if (editingRef.current) requestEditSave()
        else enterEdit()
      },
    })
  }, [isEnabled, config.activation, start, stop, pause, resume, cancel, enterEdit])

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

    // A gesture in progress. `pen` (Cmd+drag, tool-on only) draws a freehand
    // stroke; otherwise it's a click / rectangle.
    let drag:
      | { x: number; y: number; startT: number; moved: boolean; pen: boolean; points: StrokePoint[] }
      | null = null

    const onMove = (e: PointerEvent) => {
      if (isOwnUI(e)) return
      if (block) e.preventDefault()
      recorderRef.current?.samplePointer(e.clientX, e.clientY)
      if (!drag) return
      if (drag.pen) {
        drag.moved = true
        drag.points.push({ x: e.clientX, y: e.clientY })
        setDrawStroke({ points: drag.points.slice() })
        return
      }
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      // Rectangles are a mouse-tool feature — only draw them when the tool is on.
      if (block) setDragRect(rectFrom(drag.x, drag.y, e.clientX, e.clientY))
    }

    const onDown = (e: PointerEvent) => {
      if (isOwnUI(e)) return
      if (block) {
        e.preventDefault()
        e.stopPropagation()
      }
      const rec = recorderRef.current
      if (!rec) return
      // Cmd+drag with the mouse tool on = freehand draw; otherwise click/rect.
      const pen = block && e.metaKey
      drag = {
        x: e.clientX,
        y: e.clientY,
        startT: rec.clock(),
        moved: false,
        pen,
        points: pen ? [{ x: e.clientX, y: e.clientY }] : [],
      }
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

      // Cmd+drag: record the freehand stroke, keep it visible (until Cmd is
      // released, see onMetaUp), and snapshot its region.
      if (d.pen) {
        setDrawStroke(null)
        if (d.points.length < 2) return // a tap, not a stroke
        const b = boundsOf(d.points)
        const ev = rec.draw({ startT: d.startT, points: d.points, ...b })
        setDrawStrokes((prev) => [...prev, { id: nextStrokeId++, points: d.points }])
        const name = `draw-${Math.round(d.startT)}.png`
        ev.snapshot = name
        void captureStroke(d.points, b).then((blob) => {
          if (blob) rec.addSnapshot(name, blob)
          else ev.snapshot = undefined
        })
        return
      }

      if (!d.moved) {
        // A click: record the target element chain + show a radar blip.
        const target = describeElementChain(e.clientX, e.clientY)
        rec.click(e.clientX, e.clientY, e.button, target)
        setBlips((prev) => [...prev, { id: nextBlipId++, x: e.clientX, y: e.clientY }])
        return
      }

      // A drag past the threshold. Rectangles only exist with the mouse tool on;
      // when it's off (passthrough) the gesture is a normal app interaction, so
      // record nothing and let the page handle it.
      setDragRect(null)
      if (!block) return

      // Tool on: record the rectangle, flash it, and grab a region screenshot.
      const r = rectFrom(d.x, d.y, e.clientX, e.clientY)
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

    // `M` toggles the mouse tool (block + draw ⇄ passthrough) live. Handled here
    // (not in installKeyboard) so it's scoped to an active recording and so it
    // beats the block-mode key swallower below, which lets `M` through.
    // A keyboard shortcut, so it must fire regardless of where focus is — in
    // particular when a floating-bar button is focused (its events target our
    // overlay, which isOwnUI would otherwise skip). Only a real text field blocks it.
    const onToolKey = (e: KeyboardEvent) => {
      if (e.code !== MOUSE_TOOL_KEY || e.repeat || isEditableTarget()) return
      e.preventDefault()
      e.stopPropagation()
      setPassthrough((p) => !p)
    }

    // Strokes stay on screen while Cmd is held; releasing it (or losing focus,
    // e.g. Cmd-Tab) wipes them. They're already recorded, so nothing is lost.
    const clearStrokes = () => setDrawStrokes([])
    const onMetaUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') clearStrokes()
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('keydown', onToolKey, true)
    window.addEventListener('keyup', onMetaUp, true)
    window.addEventListener('blur', clearStrokes)

    // Block-mode-only: swallow the page's click/typing so the app doesn't react.
    const swallow = (e: Event) => {
      if (isOwnUI(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const swallowKey = (e: KeyboardEvent) => {
      if (isOwnUI(e)) return
      // Let our shortcuts through (Space/Esc via installKeyboard, M via onToolKey).
      if (e.code === activationKey || e.code === 'Escape' || e.code === MOUSE_TOOL_KEY) return
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
      window.removeEventListener('keydown', onToolKey, true)
      window.removeEventListener('keyup', onMetaUp, true)
      window.removeEventListener('blur', clearStrokes)
      for (const t of pageMouseEvents) window.removeEventListener(t, swallow, true)
      for (const t of pageKeyEvents) window.removeEventListener(t, swallowKey as EventListener, true)
      setDragRect(null)
    }
  }, [state, passthrough])

  // Edit mode inerts the page so Pixel's selection (a later step) can take over:
  // page clicks/activation are swallowed and any focused field is blurred. Only
  // runs when NOT recording — while recording, that effect's block/passthrough
  // already governs the page, so we don't double-install (which would fight over
  // capture-phase propagation). Pointer events are left alone for the upcoming
  // selection handler; swallowing `click` is what blocks navigation/activation.
  // Keyboard isn't swallowed, so the edit shortcuts (double-Enter / Esc) keep
  // working — and with clicks blocked, no app field can be focused to type into.
  useEffect(() => {
    if (!editing || state === 'recording') return
    const isOwnUI = (e: Event): boolean => {
      const t = e.target
      return t instanceof Element && !!t.closest('.screenshare-overlay')
    }
    const swallow = (e: Event) => {
      if (isOwnUI(e)) return
      e.preventDefault()
      e.stopPropagation()
    }
    const pageMouseEvents = ['click', 'dblclick', 'auxclick', 'mousedown', 'mouseup', 'contextmenu']
    for (const t of pageMouseEvents) window.addEventListener(t, swallow, true)
    const active = document.activeElement as HTMLElement | null
    if (active && !active.closest('.screenshare-overlay')) active.blur?.()
    return () => {
      for (const t of pageMouseEvents) window.removeEventListener(t, swallow, true)
    }
  }, [editing, state])

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
      editing,
      enterEdit,
      exitEdit,
      toggleEdit,
      saveEdits,
      passthrough,
      setPassthrough,
      bar,
      lastRecording,
      saveError,
      saving,
      resend,
      tasks,
      serverDown,
      openTask,
      blips,
      removeBlip,
      dragRect,
      rectFlashes,
      removeRectFlash,
      drawStroke,
      drawStrokes,
    }),
    [state, start, stop, pause, resume, cancel, toggle, editing, enterEdit, exitEdit, toggleEdit, saveEdits, passthrough, bar, lastRecording, saveError, saving, resend, tasks, serverDown, openTask, blips, removeBlip, dragRect, rectFlashes, removeRectFlash, drawStroke, drawStrokes],
  )

  return <ScreenshareContext.Provider value={value}>{children}</ScreenshareContext.Provider>
}
