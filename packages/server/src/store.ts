import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface SaveInput {
  meta: {
    startedAt?: number
    durationMs?: number
    events?: unknown[]
    [k: string]: unknown
  }
  audio?: Buffer
  snapshots?: { name: string; buffer: Buffer }[]
}

export interface SaveResult {
  id: string
  path: string
  hasAudio: boolean
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0')
}

/**
 * Writes recordings into a dropbox on disk:
 *
 *   <root>/inbox/<id>/{ meta.json, events.json, audio.webm }
 *
 * Each recording is assembled in <root>/tmp/<id> and atomically `rename`d into
 * inbox/ so a watcher never sees a half-written recording.
 */
export class Store {
  constructor(private readonly root: string) {}

  private newId(): string {
    const d = new Date()
    const stamp =
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
      `-${pad(d.getMilliseconds(), 3)}`
    const rand = Math.random().toString(36).slice(2, 8)
    return `${stamp}-${rand}`
  }

  async save({ meta, audio, snapshots = [] }: SaveInput): Promise<SaveResult> {
    const id = this.newId()
    const tmpDir = join(this.root, 'tmp', id)
    await mkdir(tmpDir, { recursive: true })

    const events = Array.isArray(meta.events) ? meta.events : []
    const metaOut = {
      id,
      startedAt: meta.startedAt ?? null,
      durationMs: meta.durationMs ?? null,
      eventCount: events.length,
      hasAudio: Boolean(audio),
      snapshotCount: snapshots.length,
      createdAt: Date.now(),
    }

    await writeFile(join(tmpDir, 'meta.json'), JSON.stringify(metaOut, null, 2))
    await writeFile(join(tmpDir, 'events.json'), JSON.stringify(events, null, 2))
    if (audio) {
      await writeFile(join(tmpDir, 'audio.webm'), audio)
    }
    if (snapshots.length) {
      await mkdir(join(tmpDir, 'snaps'), { recursive: true })
      for (const snap of snapshots) {
        // Guard the filename to a safe basename.
        const safe = snap.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        await writeFile(join(tmpDir, 'snaps', safe), snap.buffer)
      }
    }

    const inboxDir = join(this.root, 'inbox')
    await mkdir(inboxDir, { recursive: true })
    const dest = join(inboxDir, id)
    await rename(tmpDir, dest)

    return { id, path: dest, hasAudio: Boolean(audio) }
  }

  /**
   * Persist a batch of edit-mode changes (the "Save" button) into the same
   * dropbox recordings use, so the agent's `watch` claims it identically. The
   * brief is `edits.json` (no audio/transcript); a small `timeline.json` marker
   * makes the task "ready". Assembled in tmp/ and atomically renamed into inbox/.
   */
  async saveEdits(payload: EditSaveInput): Promise<SaveEditsResult> {
    const id = this.newId()
    const tmpDir = join(this.root, 'tmp', id)
    await mkdir(tmpDir, { recursive: true })

    const changes = Array.isArray(payload.changes) ? payload.changes : []
    const createdAt = Date.now()
    const metaOut = {
      id,
      kind: 'edit' as const,
      url: payload.url ?? null,
      // Mapped to `eventCount` so the existing bar/tasks UI shows a count.
      eventCount: changes.length,
      changeCount: changes.length,
      createdAt,
    }
    const editsOut = { url: payload.url ?? null, createdAt: payload.createdAt ?? createdAt, changes }

    await writeFile(join(tmpDir, 'meta.json'), JSON.stringify(metaOut, null, 2))
    await writeFile(join(tmpDir, 'edits.json'), JSON.stringify(editsOut, null, 2))
    // Readiness marker for the watch/claim pipeline (edits have no beats).
    await writeFile(
      join(tmpDir, 'timeline.json'),
      JSON.stringify({ kind: 'edit', changeCount: changes.length, createdAt }, null, 2),
    )

    const inboxDir = join(this.root, 'inbox')
    await mkdir(inboxDir, { recursive: true })
    const dest = join(inboxDir, id)
    await rename(tmpDir, dest)

    return { id, path: dest, changeCount: changes.length }
  }
}

export interface EditSaveInput {
  url?: string
  createdAt?: number
  changes?: unknown[]
}

export interface SaveEditsResult {
  id: string
  path: string
  changeCount: number
}
