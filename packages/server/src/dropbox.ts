import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * The on-disk dropbox layout — the single source of truth for where recordings
 * live and how they move through it. The skill drives this exclusively through
 * the `watch` / `done` CLI subcommands so it never has to know these paths.
 *
 *   <root>/inbox/<id>/     new, unclaimed recordings (fully written + processed)
 *   <root>/working/<id>/   claimed, being handled
 *   <root>/done/<id>/      finished (carries result.json)
 */

/**
 * npm runs workspace scripts with cwd at the package dir, which would bury
 * recordings under packages/server/.screenshare. Walk up to the workspace root
 * (nearest package.json declaring "workspaces") so the dropbox is predictable.
 */
function defaultRoot(): string {
  let dir = process.cwd()
  for (;;) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).workspaces) {
          return join(dir, '.screenshare')
        }
      } catch {
        /* ignore malformed package.json */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return join(process.cwd(), '.screenshare')
}

/** The dropbox root, honoring `SCREENSHARE_DIR`. */
export function resolveRoot(): string {
  return process.env.SCREENSHARE_DIR ?? defaultRoot()
}

export interface Claimed {
  id: string
  /** Absolute path to the claimed recording under working/. */
  dir: string
}

/**
 * A recording is ready to claim only once `timeline.json` exists. The server
 * writes the recording into inbox/ atomically, then transcribes + correlates
 * *asynchronously*, writing `timeline.json` last. Claiming before that would
 * both hand over an incomplete brief and orphan the in-flight writes.
 */
function isReady(dir: string): boolean {
  return existsSync(join(dir, 'timeline.json'))
}

/**
 * Atomically claim the oldest ready recording (inbox → working). `rename` is
 * atomic, so concurrent agents can't grab the same one — a loser just sees the
 * dir vanish and moves on. Returns null when nothing is ready yet.
 */
export async function claimNext(root = resolveRoot()): Promise<Claimed | null> {
  const inbox = join(root, 'inbox')
  let ids: string[]
  try {
    ids = readdirSync(inbox).sort() // ids are timestamp-prefixed → chronological
  } catch {
    return null // inbox doesn't exist yet
  }
  for (const id of ids) {
    const src = join(inbox, id)
    if (!isReady(src)) continue
    const dir = join(root, 'working', id)
    try {
      await mkdir(join(root, 'working'), { recursive: true })
      await rename(src, dir)
      return { id, dir }
    } catch {
      continue // claimed/removed by someone else between readdir and rename
    }
  }
  return null
}

/**
 * Block until a ready recording can be claimed, then claim and return it. Polls
 * `inbox/` every `intervalMs`. Used by the `watch` subcommand, which the skill
 * runs in the background; the harness re-invokes the agent when it exits.
 */
export async function watchAndClaim(
  root = resolveRoot(),
  { intervalMs = 1000 }: { intervalMs?: number } = {},
): Promise<Claimed> {
  for (;;) {
    const claimed = await claimNext(root)
    if (claimed) return claimed
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export interface Result {
  status: 'ok' | 'error'
  summary?: string
  files?: string[]
  message?: string
}

/**
 * Finish a claimed recording: write `result.json` and move it working → done so
 * it isn't reprocessed. Used by the `done` subcommand.
 */
export async function finish(root: string, id: string, result: Result): Promise<string> {
  const workingDir = join(root, 'working', id)
  if (!existsSync(workingDir)) {
    throw new Error(`no claimed recording at ${workingDir} (did you claim it with \`watch\`?)`)
  }
  const out = { ...result, finishedAt: Date.now() }
  await writeFile(join(workingDir, 'result.json'), JSON.stringify(out, null, 2))
  await mkdir(join(root, 'done'), { recursive: true })
  const doneDir = join(root, 'done', id)
  await rename(workingDir, doneDir)
  return doneDir
}
