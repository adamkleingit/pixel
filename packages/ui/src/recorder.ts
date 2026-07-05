import fixWebmDuration from 'fix-webm-duration'
import type {
  AudioTrack,
  DrawEvent,
  ElementInfo,
  FrameEvent,
  Recording,
  RectEvent,
  PixelEvent,
  SnapshotBlob,
  StrokePoint,
} from './types'

/** Emit an audio chunk on this cadence so data flushes steadily (and to prep streaming). */
const AUDIO_TIMESLICE_MS = 1000

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return AUDIO_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
}

/**
 * Owns one recording session: the monotonic clock, the event stream, and the
 * audio track. DOM event listeners live in the provider and call `samplePointer`
 * / `click`; this class is framework-free and unit-testable.
 */
export class Recorder {
  startedAt = 0

  private t0 = 0
  private pausedAccum = 0
  private pauseStart = 0
  private paused = false
  private events: PixelEvent[] = []
  private snapshots: SnapshotBlob[] = []
  private stream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private minIntervalMs: number
  private lastSampleT = -Infinity

  constructor(opts: { pointerHz?: number } = {}) {
    this.minIntervalMs = 1000 / (opts.pointerHz ?? 30)
  }

  /** Active recording time in ms since start (paused spans excluded). */
  private now(): number {
    const ref = this.paused ? this.pauseStart : performance.now()
    return ref - this.t0 - this.pausedAccum
  }

  pause(): void {
    if (this.paused) return
    this.paused = true
    this.pauseStart = performance.now()
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
    }
  }

  resume(): void {
    if (!this.paused) return
    this.paused = false
    this.pausedAccum += performance.now() - this.pauseStart
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
    }
  }

  /** Discard the recording: stop the mic and drop everything. */
  abort(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.ondataavailable = null
        this.mediaRecorder.onstop = null
        this.mediaRecorder.stop()
      }
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.mediaRecorder = null
    this.events = []
    this.snapshots = []
    this.chunks = []
  }

  async start(opts: { audio: boolean }): Promise<{ audioEnabled: boolean }> {
    this.t0 = performance.now()
    this.startedAt = Date.now()
    this.pausedAccum = 0
    this.pauseStart = 0
    this.paused = false
    this.events = []
    this.snapshots = []
    this.chunks = []
    this.lastSampleT = -Infinity

    if (!opts.audio) return { audioEnabled: false }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickAudioMime()
      this.mediaRecorder = new MediaRecorder(
        this.stream,
        mimeType ? { mimeType } : undefined,
      )
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data)
      }
      this.mediaRecorder.start(AUDIO_TIMESLICE_MS)
      return { audioEnabled: true }
    } catch (err) {
      // Mic denied or unavailable → record events only, never hard-fail.
      console.warn('[pixel] audio unavailable, recording events only:', err)
      this.stream = null
      this.mediaRecorder = null
      return { audioEnabled: false }
    }
  }

  samplePointer(x: number, y: number): void {
    const t = this.now()
    if (t - this.lastSampleT < this.minIntervalMs) return
    this.lastSampleT = t
    this.events.push({ kind: 'pointer', t, x, y })
  }

  click(x: number, y: number, button: number, target: ElementInfo[]): number {
    const t = this.now()
    this.events.push({ kind: 'click', t, x, y, button, target })
    return t
  }

  /** Record a rectangle drag. `startT` is the active time when the drag began. */
  rect(args: {
    startT: number
    x: number
    y: number
    width: number
    height: number
  }): RectEvent {
    const endT = this.now()
    const ev: RectEvent = {
      kind: 'rect',
      t: args.startT,
      startT: args.startT,
      endT,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
    }
    this.events.push(ev)
    return ev
  }

  /** Record a freehand draw (Cmd+drag). `startT` is the active time at stroke start. */
  draw(args: {
    startT: number
    points: StrokePoint[]
    x: number
    y: number
    width: number
    height: number
  }): DrawEvent {
    const ev: DrawEvent = {
      kind: 'draw',
      t: args.startT,
      startT: args.startT,
      endT: this.now(),
      points: args.points,
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
    }
    this.events.push(ev)
    return ev
  }

  /** Record a full-frame screenshot reference (start/resume). */
  frame(reason: FrameEvent['reason'], snapshot: string, width: number, height: number): void {
    this.events.push({ kind: 'frame', t: this.now(), reason, snapshot, width, height })
  }

  /** Active recording time in ms (exposed so the provider can stamp drag starts). */
  clock(): number {
    return this.now()
  }

  addSnapshot(name: string, blob: Blob): void {
    this.snapshots.push({ name, blob })
  }

  async stop(): Promise<Recording> {
    const durationMs = this.now()

    let audio: AudioTrack | null = null
    if (this.mediaRecorder) {
      const mr = this.mediaRecorder
      audio = await new Promise<AudioTrack | null>((resolve) => {
        mr.onstop = async () => {
          if (this.chunks.length === 0) return resolve(null)
          const type = this.chunks[0].type || 'audio/webm'
          let blob = new Blob(this.chunks, { type })
          // MediaRecorder webm files carry no duration, so players (and Chrome's
          // file:// viewer) show 0:00 / "empty". Patch the duration into the
          // header so the recording is directly playable. Best-effort.
          if (type.includes('webm')) {
            try {
              blob = await fixWebmDuration(blob, durationMs, { logger: false })
            } catch (err) {
              console.warn('[pixel] could not patch webm duration:', err)
            }
          }
          resolve({ mime: blob.type, blob })
        }
        mr.stop()
      })
    }

    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.mediaRecorder = null

    return {
      startedAt: this.startedAt,
      durationMs,
      events: this.events,
      audio,
      snapshots: this.snapshots,
    }
  }
}
