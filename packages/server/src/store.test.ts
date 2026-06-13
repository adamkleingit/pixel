import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Store } from './store'

describe('Store.save', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pixel-store-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes meta.json and events.json into inbox/<id> and reports the result', async () => {
    const store = new Store(root)
    const events = [{ kind: 'click', t: 1 }, { kind: 'pointer', t: 2 }]
    const result = await store.save({ meta: { startedAt: 123, durationMs: 4567, events } })

    expect(result.hasAudio).toBe(false)
    expect(result.path).toBe(join(root, 'inbox', result.id))
    expect(existsSync(result.path)).toBe(true)

    const meta = JSON.parse(await readFile(join(result.path, 'meta.json'), 'utf8'))
    expect(meta).toMatchObject({
      id: result.id,
      startedAt: 123,
      durationMs: 4567,
      eventCount: 2,
      hasAudio: false,
      snapshotCount: 0,
    })

    const written = JSON.parse(await readFile(join(result.path, 'events.json'), 'utf8'))
    expect(written).toEqual(events)
  })

  it('persists audio and marks hasAudio when an audio buffer is given', async () => {
    const store = new Store(root)
    const audio = Buffer.from('fake-webm')
    const result = await store.save({ meta: { events: [] }, audio })

    expect(result.hasAudio).toBe(true)
    expect(await readFile(join(result.path, 'audio.webm'))).toEqual(audio)
    const meta = JSON.parse(await readFile(join(result.path, 'meta.json'), 'utf8'))
    expect(meta.hasAudio).toBe(true)
  })

  it('sanitizes snapshot filenames to a safe basename', async () => {
    const store = new Store(root)
    const result = await store.save({
      meta: { events: [] },
      snapshots: [{ name: '../../etc/passwd', buffer: Buffer.from('x') }],
    })
    const snaps = await readdir(join(result.path, 'snaps'))
    // only path separators are stripped; dots are allowed, so traversal can't escape snaps/
    expect(snaps).toEqual(['.._.._etc_passwd'])
    expect(snaps[0]).not.toContain('/')
  })

  it('defaults missing meta fields to null and treats non-array events as empty', async () => {
    const store = new Store(root)
    const result = await store.save({ meta: { events: 'not-an-array' as any } })
    const meta = JSON.parse(await readFile(join(result.path, 'meta.json'), 'utf8'))
    expect(meta.startedAt).toBeNull()
    expect(meta.durationMs).toBeNull()
    expect(meta.eventCount).toBe(0)
    expect(JSON.parse(await readFile(join(result.path, 'events.json'), 'utf8'))).toEqual([])
  })

  it('generates distinct ids and leaves no tmp dir behind', async () => {
    const store = new Store(root)
    const a = await store.save({ meta: { events: [] } })
    const b = await store.save({ meta: { events: [] } })
    expect(a.id).not.toBe(b.id)

    const entries = await readdir(root)
    // tmp/ may or may not exist; if it does it must be empty after atomic rename
    if (entries.includes('tmp')) {
      expect(await readdir(join(root, 'tmp'))).toHaveLength(0)
    }
    expect((await readdir(join(root, 'inbox'))).sort()).toEqual([a.id, b.id].sort())
  })
})
