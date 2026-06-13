import type { Recording, RecordingSink } from '../types'

export const DEFAULT_SERVER_URL = 'http://localhost:41789'

/**
 * Sends a finished recording to `@getpixel/server` as multipart/form-data:
 * a `meta` JSON field (startedAt, durationMs, events) plus an `audio` file part.
 */
export function httpSink(baseUrl: string = DEFAULT_SERVER_URL): RecordingSink {
  return {
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

      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/recordings`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        throw new Error(`screenshare server responded ${res.status}`)
      }
      return (await res.json()) as { id: string }
    },
  }
}
