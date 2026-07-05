import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** An event may be assigned to a transcript span up to this far outside it (ms). */
const SPAN_THRESHOLD_MS = 500
/** Silence events within this gap of each other are grouped into one silence beat. */
const SILENCE_GROUP_GAP_MS = 1500

interface ElementInfo {
  tag: string
  id?: string
  classes: string[]
  text?: string
}
interface BaseEvent {
  kind: string
  t: number
}
interface ClickEvent extends BaseEvent {
  kind: 'click'
  x: number
  y: number
  target: ElementInfo[]
}
interface RectEvent extends BaseEvent {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  startT: number
  endT: number
  snapshot?: string
}
interface DrawEvent extends BaseEvent {
  kind: 'draw'
  x: number
  y: number
  width: number
  height: number
  startT: number
  endT: number
  points: { x: number; y: number }[]
  snapshot?: string
}
type AnyEvent = BaseEvent | ClickEvent | RectEvent | DrawEvent

interface Segment {
  start: number // seconds
  end: number
  text: string
}

interface TimelineItem {
  type: 'click' | 'rect' | 'draw'
  t: number
  /** for clicks: a compact path like "div.grid > div.card > button.btn 'Upgrade'" */
  summary?: string
  element?: ElementInfo
  /** for rects and draws: the region (+ snapshot filename). */
  rect?: { x: number; y: number; width: number; height: number; snapshot?: string }
}

interface Beat {
  kind: 'speech' | 'silence'
  startMs: number
  endMs: number
  text?: string
  pointerCount: number
  items: TimelineItem[]
}

function elementSummary(chain: ElementInfo[]): { element?: ElementInfo; summary?: string } {
  if (!chain.length) return {}
  const inner = chain[chain.length - 1]
  const part = (e: ElementInfo) => {
    let s = e.tag
    if (e.id) s += `#${e.id}`
    if (e.classes.length) s += `.${e.classes.slice(0, 2).join('.')}`
    return s
  }
  const tail = chain.slice(-3).map(part).join(' > ')
  const text = inner.text ? ` "${inner.text.slice(0, 40)}"` : ''
  return { element: inner, summary: tail + text }
}

function toItem(ev: AnyEvent): TimelineItem | null {
  if (ev.kind === 'click') {
    const c = ev as ClickEvent
    const { element, summary } = elementSummary(c.target ?? [])
    return { type: 'click', t: c.t, element, summary }
  }
  if (ev.kind === 'rect') {
    const r = ev as RectEvent
    return {
      type: 'rect',
      t: r.t,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height, snapshot: r.snapshot },
    }
  }
  if (ev.kind === 'draw') {
    const d = ev as DrawEvent
    return {
      type: 'draw',
      t: d.t,
      rect: { x: d.x, y: d.y, width: d.width, height: d.height, snapshot: d.snapshot },
    }
  }
  return null
}

/** Distance (ms) from an event time to a span [s0,s1]; 0 if inside. */
function distanceToSpan(t: number, s0: number, s1: number): number {
  if (t < s0) return s0 - t
  if (t > s1) return t - s1
  return 0
}

interface FrameRef {
  t: number
  reason: string
  snapshot: string
  width: number
  height: number
}

export interface Timeline {
  durationMs: number
  hasTranscript: boolean
  /** Full-viewport screenshots (with coordinate grid) captured at start/resume. */
  frames: FrameRef[]
  beats: Beat[]
  createdAt: number
}

/**
 * Merges events.json + transcript.json into one time-ordered timeline. Events are
 * grouped under the transcription span they fall in (or within SPAN_THRESHOLD_MS
 * of); events nearer the next span go to it; events near no span form their own
 * `silence` beats. Pointer samples are summarized as a count per beat.
 */
export function buildTimeline(events: AnyEvent[], segments: Segment[], durationMs: number): Timeline {
  const frames: FrameRef[] = events
    .filter((e) => e.kind === 'frame')
    .map((e) => {
      const f = e as unknown as FrameRef & { t: number }
      return { t: f.t, reason: f.reason, snapshot: f.snapshot, width: f.width, height: f.height }
    })

  const spans = segments
    .map((s) => ({ s0: s.start * 1000, s1: s.end * 1000, text: s.text }))
    .sort((a, b) => a.s0 - b.s0)

  // Speech beats keyed by span index; silence events collected separately.
  const speechItems: TimelineItem[][] = spans.map(() => [])
  const speechPointer: number[] = spans.map(() => 0)
  const silence: { t: number; item: TimelineItem | null }[] = []

  for (const ev of events) {
    if (ev.kind === 'frame') continue // captured separately as frames[]
    // find nearest span
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < spans.length; i++) {
      const d = distanceToSpan(ev.t, spans[i].s0, spans[i].s1)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    const inSpan = best >= 0 && bestDist <= SPAN_THRESHOLD_MS
    const item = toItem(ev)
    if (inSpan) {
      if (ev.kind === 'pointer') speechPointer[best]++
      else if (item) speechItems[best].push(item)
    } else {
      silence.push({ t: ev.t, item: ev.kind === 'pointer' ? null : item })
    }
  }

  const beats: Beat[] = spans.map((sp, i) => ({
    kind: 'speech' as const,
    startMs: sp.s0,
    endMs: sp.s1,
    text: sp.text,
    pointerCount: speechPointer[i],
    items: speechItems[i].sort((a, b) => a.t - b.t),
  }))

  // Group silence events (by time) into contiguous silence beats.
  silence.sort((a, b) => a.t - b.t)
  let cur: Beat | null = null
  let lastT = -Infinity
  for (const s of silence) {
    if (!cur || s.t - lastT > SILENCE_GROUP_GAP_MS) {
      cur = { kind: 'silence', startMs: s.t, endMs: s.t, pointerCount: 0, items: [] }
      beats.push(cur)
    }
    cur.endMs = s.t
    if (s.item) cur.items.push(s.item)
    else cur.pointerCount++
    lastT = s.t
  }

  beats.sort((a, b) => a.startMs - b.startMs)
  return { durationMs, hasTranscript: spans.length > 0, frames, beats, createdAt: Date.now() }
}

/** Reads a recording dir's events.json (+ transcript.json if present) and writes timeline.json. */
export async function correlateRecording(dir: string): Promise<void> {
  try {
    const eventsPath = join(dir, 'events.json')
    if (!existsSync(eventsPath)) return
    const events: AnyEvent[] = JSON.parse(readFileSync(eventsPath, 'utf8'))

    let segments: Segment[] = []
    let durationMs = 0
    const transcriptPath = join(dir, 'transcript.json')
    if (existsSync(transcriptPath)) {
      const t = JSON.parse(readFileSync(transcriptPath, 'utf8'))
      segments = t.segments ?? []
    }
    const metaPath = join(dir, 'meta.json')
    if (existsSync(metaPath)) {
      durationMs = JSON.parse(readFileSync(metaPath, 'utf8')).durationMs ?? 0
    }

    const timeline = buildTimeline(events, segments, durationMs)
    await writeFile(join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2))
    console.log(
      `[pixel] timeline ${dir.split('/').pop()} — ${timeline.beats.length} beats ` +
        `(${timeline.hasTranscript ? 'with transcript' : 'events only'})`,
    )
  } catch (err) {
    console.warn('[pixel] correlation failed:', err)
  }
}
