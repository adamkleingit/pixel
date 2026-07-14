import type { Token } from '../pixel-common'
import type { CommentPayload, EditPayload, Recording, RecordingSink, Task } from '../types'

export const DEFAULT_SERVER_URL = 'http://localhost:41789'

/** Default cap on the task poll so a hung server surfaces as "down", not silence. */
const DEFAULT_TASKS_TIMEOUT_MS = 5000

export interface HttpSinkOptions {
  /**
   * Abort the task poll after this many ms. A server that accepts the connection
   * but never responds would otherwise hang the fetch forever, leaving the bar
   * showing neither tasks nor the error state. Default 5000.
   */
  tasksTimeoutMs?: number
}

/**
 * Sends a finished recording to `@getpixel/server` as multipart/form-data:
 * a `meta` JSON field (startedAt, durationMs, events) plus an `audio` file part.
 */
export function httpSink(
  baseUrl: string = DEFAULT_SERVER_URL,
  { tasksTimeoutMs = DEFAULT_TASKS_TIMEOUT_MS }: HttpSinkOptions = {},
): RecordingSink {
  const root = baseUrl.replace(/\/$/, '')
  return {
    async listTasks(): Promise<Task[]> {
      // Bound the request: a hung/unreachable server must reject (→ error icon),
      // not leave the poll pending indefinitely.
      const res = await fetch(`${root}/tasks`, {
        signal: tasksTimeoutMs > 0 ? AbortSignal.timeout(tasksTimeoutMs) : undefined,
      })
      if (!res.ok) {
        throw new Error(`pixel server responded ${res.status}`)
      }
      const body = (await res.json()) as { tasks?: Task[] }
      return body.tasks ?? []
    },
    async openTask(id: string): Promise<void> {
      const res = await fetch(`${root}/tasks/${encodeURIComponent(id)}/reveal`, { method: 'POST' })
      if (!res.ok) {
        throw new Error(`pixel server responded ${res.status}`)
      }
    },
    async fetchTokens(): Promise<{ tokens: Token[] }> {
      const res = await fetch(`${root}/tokens`, {
        signal: tasksTimeoutMs > 0 ? AbortSignal.timeout(tasksTimeoutMs) : undefined,
      })
      if (!res.ok) {
        throw new Error(`pixel server responded ${res.status}`)
      }
      const body = (await res.json()) as { tokens?: Token[] }
      return { tokens: body.tokens ?? [] }
    },
    async save(rec: Recording): Promise<{ id: string }> {
      const form = new FormData()
      form.append(
        'meta',
        JSON.stringify({
          startedAt: rec.startedAt,
          durationMs: rec.durationMs,
          language: rec.language,
          events: rec.events,
        }),
      )
      if (rec.audio) {
        form.append('audio', rec.audio.blob, 'audio.webm')
      }
      for (const snap of rec.snapshots) {
        form.append('snapshot', snap.blob, snap.name)
      }

      const res = await fetch(`${root}/recordings`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        throw new Error(`pixel server responded ${res.status}`)
      }
      return (await res.json()) as { id: string }
    },
    async saveEdits(payload: EditPayload): Promise<{ id: string }> {
      const res = await fetch(`${root}/edits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(`pixel server responded ${res.status}`)
      }
      return (await res.json()) as { id: string }
    },
    async saveComments(payload: CommentPayload): Promise<{ id: string }> {
      const res = await fetch(`${root}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(`pixel server responded ${res.status}`)
      }
      return (await res.json()) as { id: string }
    },
  }
}
