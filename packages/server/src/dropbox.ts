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

/** A recording's lifecycle stage, derived from which bucket it sits in. */
export type TaskStatus = 'pending' | 'executing' | 'done' | 'error'

export interface Task {
  id: string
  status: TaskStatus
  /** What produced the task: a screen `recording`, or a saved `edit` batch. */
  kind?: 'recording' | 'edit'
  /** Epoch ms the recording was written (from meta.json), if available. */
  createdAt?: number
  durationMs?: number
  eventCount?: number
  /** For finished tasks: the agent's summary / error message (from result.json). */
  summary?: string
  message?: string
}

function readJsonSync<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function listBucket(root: string, bucket: string): string[] {
  try {
    // Ignore dotfiles (e.g. .DS_Store, created when Finder opens the folder) —
    // only timestamp-prefixed recording directories are tasks.
    return readdirSync(join(root, bucket))
      .filter((name) => !name.startsWith('.'))
      .sort()
  } catch {
    return [] // bucket doesn't exist yet
  }
}

/** Absolute path to a recording's directory, whichever bucket it sits in. Null if unknown. */
export function taskDir(root: string, id: string): string | null {
  for (const bucket of ['inbox', 'working', 'done']) {
    const dir = join(root, bucket, id)
    if (existsSync(dir)) return dir
  }
  return null
}

type Meta = { kind?: string; createdAt?: number; durationMs?: number; eventCount?: number }

/** Normalize a meta block into the fields the bar's task list wants, mapping the
 *  on-disk `kind` ("edit" | absent) to the closed union the UI renders. */
function taskMeta(m: Meta): Omit<Task, 'id' | 'status'> {
  const { kind, ...rest } = m
  return { kind: kind === 'edit' ? 'edit' : 'recording', ...rest }
}

/**
 * Snapshot the recordings the server knows about, tagged with the lifecycle
 * stage implied by their bucket: inbox → pending, working → executing, done →
 * done/error (from result.json). Newest first, capped to the latest `limit`
 * entries so the history stays bounded.
 */
export function listTasks(root = resolveRoot(), { limit = 10 }: { limit?: number } = {}): Task[] {
  const meta = (bucket: string, id: string): Omit<Task, 'id' | 'status'> =>
    taskMeta(readJsonSync<Meta>(join(root, bucket, id, 'meta.json')) ?? {})

  const active: Task[] = [
    ...listBucket(root, 'inbox').map((id): Task => ({ id, status: 'pending', ...meta('inbox', id) })),
    ...listBucket(root, 'working').map((id): Task => ({ id, status: 'executing', ...meta('working', id) })),
  ]

  // Only the newest `limit` finished recordings can survive the cap, so read
  // result.json for just those rather than the whole done/ history.
  const done: Task[] = listBucket(root, 'done')
    .slice(-limit)
    .map((id): Task => {
      const result = readJsonSync<Result>(join(root, 'done', id, 'result.json'))
      return {
        id,
        status: result?.status === 'error' ? 'error' : 'done',
        ...meta('done', id),
        summary: result?.summary,
        message: result?.message,
      }
    })

  // ids are timestamp-prefixed, so a descending id sort is reverse-chronological.
  return [...active, ...done].sort((a, b) => (a.id < b.id ? 1 : -1)).slice(0, limit)
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
