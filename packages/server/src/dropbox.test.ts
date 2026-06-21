import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claimNext, finish, listTasks, watchAndClaim } from './dropbox'

/** Drop a recording into inbox/<id>; `ready` controls whether timeline.json exists. */
async function seed(root: string, id: string, { ready = true } = {}): Promise<void> {
  const dir = join(root, 'inbox', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'events.json'), '[]')
  if (ready) await writeFile(join(dir, 'timeline.json'), '[]')
}

describe('dropbox', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pixel-dropbox-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  describe('claimNext', () => {
    it('returns null when the inbox is missing or empty', async () => {
      expect(await claimNext(root)).toBeNull()
      await mkdir(join(root, 'inbox'), { recursive: true })
      expect(await claimNext(root)).toBeNull()
    })

    it('claims the oldest ready recording and moves it inbox → working', async () => {
      await seed(root, '20260613-100000-000-aaaaaa')
      await seed(root, '20260613-100500-000-bbbbbb')

      const claimed = await claimNext(root)
      expect(claimed?.id).toBe('20260613-100000-000-aaaaaa') // oldest first
      expect(claimed?.dir).toBe(join(root, 'working', claimed!.id))
      expect(existsSync(claimed!.dir)).toBe(true)
      expect(existsSync(join(root, 'inbox', claimed!.id))).toBe(false)
    })

    it('skips recordings without timeline.json (still being processed)', async () => {
      await seed(root, '20260613-100000-000-aaaaaa', { ready: false })
      expect(await claimNext(root)).toBeNull()

      // once it's ready, the same id is claimable
      await writeFile(join(root, 'inbox', '20260613-100000-000-aaaaaa', 'timeline.json'), '[]')
      expect((await claimNext(root))?.id).toBe('20260613-100000-000-aaaaaa')
    })

    it('claims each recording only once', async () => {
      await seed(root, '20260613-100000-000-aaaaaa')
      const first = await claimNext(root)
      const second = await claimNext(root)
      expect(first?.id).toBe('20260613-100000-000-aaaaaa')
      expect(second).toBeNull()
    })
  })

  describe('watchAndClaim', () => {
    it('blocks until a ready recording appears, then claims it', async () => {
      const pending = watchAndClaim(root, { intervalMs: 5 })
      // nothing yet; drop one in after a tick
      await new Promise((r) => setTimeout(r, 20))
      await seed(root, '20260613-100000-000-aaaaaa')
      const claimed = await pending
      expect(claimed.id).toBe('20260613-100000-000-aaaaaa')
      expect(existsSync(claimed.dir)).toBe(true)
    })
  })

  describe('finish', () => {
    it('writes result.json and moves working → done', async () => {
      await seed(root, '20260613-100000-000-aaaaaa')
      const { id } = (await claimNext(root))!

      const doneDir = await finish(root, id, {
        status: 'ok',
        summary: 'did the thing',
        files: ['a.ts', 'b.ts'],
      })

      expect(doneDir).toBe(join(root, 'done', id))
      expect(existsSync(join(root, 'working', id))).toBe(false)
      const result = JSON.parse(await readFile(join(doneDir, 'result.json'), 'utf8'))
      expect(result).toMatchObject({ status: 'ok', summary: 'did the thing', files: ['a.ts', 'b.ts'] })
      expect(typeof result.finishedAt).toBe('number')
    })

    it('throws if the recording was never claimed', async () => {
      await expect(finish(root, 'nope', { status: 'ok' })).rejects.toThrow(/no claimed recording/)
    })
  })

  describe('listTasks', () => {
    it('returns an empty list when nothing has been recorded', () => {
      expect(listTasks(root)).toEqual([])
    })

    it('tags each recording with the status implied by its bucket', async () => {
      // claimNext always takes the oldest ready recording, so move each one into
      // its bucket before seeding the next — then leave one unclaimed in inbox.
      await seed(root, '20260613-100100-000-running')
      await claimNext(root) // → working

      await seed(root, '20260613-100200-000-okdone')
      const okId = (await claimNext(root))!.id
      await finish(root, okId, { status: 'ok', summary: 'shipped it' })

      await seed(root, '20260613-100300-000-errdone')
      const errId = (await claimNext(root))!.id
      await finish(root, errId, { status: 'error', message: 'could not apply' })

      await seed(root, '20260613-100400-000-pending') // left in inbox

      const tasks = listTasks(root)
      const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))

      expect(byId['20260613-100400-000-pending'].status).toBe('pending')
      expect(byId['20260613-100100-000-running'].status).toBe('executing')
      expect(byId['20260613-100200-000-okdone']).toMatchObject({
        status: 'done',
        summary: 'shipped it',
      })
      expect(byId['20260613-100300-000-errdone']).toMatchObject({
        status: 'error',
        message: 'could not apply',
      })
    })

    it('sorts newest first and includes meta fields when present', async () => {
      const dir = join(root, 'inbox', '20260613-120000-000-aaaaaa')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'timeline.json'), '[]')
      await writeFile(
        join(dir, 'meta.json'),
        JSON.stringify({ createdAt: 123, durationMs: 4567, eventCount: 9 }),
      )
      await seed(root, '20260613-110000-000-older')

      const tasks = listTasks(root)
      expect(tasks.map((t) => t.id)).toEqual([
        '20260613-120000-000-aaaaaa', // newer first
        '20260613-110000-000-older',
      ])
      expect(tasks[0]).toMatchObject({ createdAt: 123, durationMs: 4567, eventCount: 9 })
    })

    it('ignores dotfiles like .DS_Store', async () => {
      await seed(root, '20260613-110000-000-real')
      await writeFile(join(root, 'inbox', '.DS_Store'), 'junk')
      const tasks = listTasks(root)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('20260613-110000-000-real')
    })

    it('caps the list to the latest `limit` entries', async () => {
      for (let i = 0; i < 5; i++) {
        const id = `20260613-1000${i}0-000-done${i}`
        await seed(root, id)
        const claimed = (await claimNext(root))!
        await finish(root, claimed.id, { status: 'ok' })
      }
      const tasks = listTasks(root, { limit: 2 })
      expect(tasks).toHaveLength(2)
      // newest first: the two most recent ids
      expect(tasks.map((t) => t.id)).toEqual([
        '20260613-100040-000-done4',
        '20260613-100030-000-done3',
      ])
    })
  })
})
