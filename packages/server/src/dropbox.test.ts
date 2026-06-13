import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claimNext, finish, watchAndClaim } from './dropbox'

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
})
