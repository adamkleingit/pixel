/**
 * Bug reporter — records the screen (+ mic) via getDisplayMedia/getUserMedia and
 * uploads it, with a metadata sidecar, straight to Vercel Blob (client upload,
 * so large recordings bypass the serverless body limit). Drives the bar's
 * "Report a bug" button; independent of the pixel/edit pipeline.
 *
 * The upload target is a client-upload token route — `@getpixel/server`'s
 * `POST /bug-report`, the same server the SDK is already connected to. It mints
 * a scoped Vercel Blob token (holding the RW secret server-side) and the browser
 * uploads directly to Blob. Files land at `bug-reports/<id>/recording.webm` +
 * `bug-reports/<id>/meta.json`.
 */

// ---- console capture --------------------------------------------------------
// A small ring buffer of recent errors/warnings, attached to every report so a
// bug that logged something is diagnosable without a repro.

interface CapturedLog {
  t: number
  level: 'error' | 'warn'
  text: string
}

const CONSOLE_RING: CapturedLog[] = []
const MAX_LOGS = 50
let consoleInstalled = false

function safeString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Patch console.error/warn + window error handlers to record recent messages.
 *  Idempotent; call once at SDK init. */
export function installConsoleCapture(): void {
  if (consoleInstalled || typeof window === 'undefined') return
  consoleInstalled = true
  const push = (level: CapturedLog['level'], args: unknown[]): void => {
    CONSOLE_RING.push({ t: Date.now(), level, text: args.map(safeString).join(' ').slice(0, 2000) })
    if (CONSOLE_RING.length > MAX_LOGS) CONSOLE_RING.shift()
  }
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    push('error', args)
    origError(...args)
  }
  const origWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    push('warn', args)
    origWarn(...args)
  }
  window.addEventListener('error', (e) => push('error', [e.message, e.error]))
  window.addEventListener('unhandledrejection', (e) =>
    push('error', ['unhandledrejection', (e as PromiseRejectionEvent).reason]),
  )
}

// ---- recording --------------------------------------------------------------

export interface BugRecording {
  /** Resolves with the finished webm blob once recording stops. */
  readonly blob: Promise<Blob>
  /** Epoch ms when recording started. */
  readonly startedAt: number
  /** Stop recording + release the screen/mic tracks. Idempotent. */
  stop(): void
  /** Called when the recording ends on its own — the user hit the browser's
   *  "Stop sharing". */
  onEnded(cb: () => void): void
}

function pickMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

/**
 * Prompt for a screen share (+ best-effort mic) and start recording. Rejects if
 * the user cancels/denies the screen-share prompt.
 */
export async function startBugRecording(): Promise<BugRecording> {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
  let mic: MediaStream | null = null
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    mic = null // no mic / denied → silent screen recording
  }

  const stream = new MediaStream([...display.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])])
  const mime = pickMime()
  const rec = new MediaRecorder(stream, { mimeType: mime })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data)
  }
  const startedAt = Date.now()
  let endedCb: (() => void) | null = null
  const blob = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }))
  })

  const stop = (): void => {
    if (rec.state !== 'inactive') rec.stop()
    display.getTracks().forEach((t) => t.stop())
    mic?.getTracks().forEach((t) => t.stop())
  }
  // The user can end the capture from the browser's own "Stop sharing" control.
  display.getVideoTracks()[0]?.addEventListener('ended', () => {
    stop()
    endedCb?.()
  })

  rec.start(1000) // 1s timeslices
  return {
    blob,
    startedAt,
    stop,
    onEnded(cb) {
      endedCb = cb
    },
  }
}

// ---- upload -----------------------------------------------------------------

export interface BugReportResult {
  id: string
  recordingUrl: string
  metaUrl: string
}

/** `YYYYMMDD-HHMMSS-<rand>` — sorts chronologically and isn't guessable. */
function reportId(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const rand = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${rand}`
}

/**
 * Upload a finished bug recording (+ a meta.json sidecar) to Vercel Blob via the
 * client-upload token route at `endpoint`. `@vercel/blob/client` is imported
 * lazily so consumers that never report a bug don't pay for it.
 */
export async function uploadBugReport(
  recording: Blob,
  opts: { endpoint: string; startedAt: number; meta?: Record<string, unknown> },
): Promise<BugReportResult> {
  const { upload } = await import('@vercel/blob/client')
  const id = reportId()
  const base = `bug-reports/${id}`

  const meta = {
    id,
    createdAt: Date.now(),
    durationMs: Date.now() - opts.startedAt,
    url: typeof location !== 'undefined' ? location.href : '',
    title: typeof document !== 'undefined' ? document.title : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    viewport:
      typeof window !== 'undefined'
        ? { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio }
        : null,
    consoleErrors: CONSOLE_RING.slice(),
    ...opts.meta,
  }

  // MediaRecorder tags the blob `video/webm;codecs=vp9,opus`, but Blob matches
  // the allow-list exactly — send the bare container type (codecs live inside the
  // container anyway).
  const contentType = (recording.type || 'video/webm').split(';')[0]
  const recRes = await upload(`${base}/recording.webm`, recording, {
    access: 'public',
    contentType,
    handleUploadUrl: opts.endpoint,
    multipart: true, // chunked, resumable — safe for large recordings
  })
  const metaBlob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })
  const metaRes = await upload(`${base}/meta.json`, metaBlob, {
    access: 'public',
    contentType: 'application/json',
    handleUploadUrl: opts.endpoint,
  })

  return { id, recordingUrl: recRes.url, metaUrl: metaRes.url }
}
