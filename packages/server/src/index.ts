import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { Store } from './store.js'
import { fileTranscriber, transcribeRecording, whisperTranscriber } from './transcribe.js'
import { correlateRecording } from './correlate.js'
import { finish, listTasks, resolveRoot, taskDir, watchAndClaim } from './dropbox.js'

/** Open a directory in the OS file manager (Finder / Explorer / xdg). */
function openInFileManager(dir: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  // Pass the path as an arg (no shell) so it can't be interpreted as a command.
  // explorer.exe exits non-zero even on success, so the error is ignored.
  execFile(cmd, [dir], () => {})
}

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Locate the SKILL.md bundled with THIS package version. Published layout puts it
 * at `<pkg>/skill` (sibling of `dist`); in the dev repo it also lives at the
 * monorepo root `skills/`. Checking the bundled copy first guarantees the skill
 * we install matches the installed @getpixel/server version.
 */
function resolveBundledSkill(): string {
  const candidates = [
    join(HERE, '..', 'skill'), // published & post-build: dist/ or src/ → ../skill
    join(HERE, '..', '..', '..', 'skills', 'pixel'), // dev monorepo root
  ]
  const found = candidates.find((c) => existsSync(join(c, 'SKILL.md')))
  if (!found) throw new Error('bundled pixel skill not found')
  return found
}

/**
 * `pixel-server install-skill [--global]` — copy the bundled skill into the
 * Claude skills dir (project `.claude/skills` by default, `~/.claude/skills` with
 * `--global`) so it always matches the installed package version.
 */
function installSkill(): void {
  const global = process.argv.includes('--global')
  const base = global
    ? join(homedir(), '.claude', 'skills')
    : join(process.cwd(), '.claude', 'skills')
  const dest = join(base, 'pixel')
  mkdirSync(dest, { recursive: true })
  cpSync(resolveBundledSkill(), dest, { recursive: true })
  console.log(`Installed pixel skill → ${dest}`)
}

/** Parse `--key value` / `--flag` pairs from argv into a plain object. */
function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = 'true'
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

switch (process.argv[2]) {
  case 'install-skill': {
    installSkill()
    process.exit(0)
    break
  }
  // `pixel-server watch` — block until a recording is ready, atomically claim it
  // (inbox → working), print `{ id, dir }` as JSON, and exit. The skill runs this
  // in the background and is re-invoked when it exits.
  case 'watch': {
    const claimed = await watchAndClaim(resolveRoot())
    console.log(JSON.stringify(claimed))
    process.exit(0)
    break
  }
  // `pixel-server done <id> [--status ok|error] [--summary ...] [--files a,b] [--message ...]`
  // — write result.json and move the claimed recording working → done.
  case 'done': {
    const id = process.argv[3]
    if (!id || id.startsWith('--')) {
      console.error(
        'usage: pixel-server done <id> [--status ok|error] [--summary <text>] ' +
          '[--files <a,b,c>] [--message <text>]',
      )
      process.exit(1)
    }
    const flags = parseFlags(process.argv.slice(4))
    try {
      const doneDir = await finish(resolveRoot(), id, {
        status: flags.status === 'error' ? 'error' : 'ok',
        summary: flags.summary,
        files: flags.files
          ? flags.files
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        message: flags.message,
      })
      console.log(`done ${id} → ${doneDir}`)
      process.exit(0)
    } catch (err) {
      console.error(`done failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
    break
  }
  default:
    startServer()
}

function startServer(): void {
  const TRANSCRIBE = process.env.SCREENSHARE_TRANSCRIBE !== '0'
  const PORT = Number(process.env.SCREENSHARE_PORT ?? 41789)
  const ROOT = resolveRoot()

  // Tests set SCREENSHARE_TRANSCRIBE_MOCK to a fixture path so the pipeline runs
  // end-to-end without loading Whisper / ffmpeg. Unset → the real transcriber.
  const mock = process.env.SCREENSHARE_TRANSCRIBE_MOCK
  const transcriber = mock ? fileTranscriber(mock) : whisperTranscriber

  const store = new Store(ROOT)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  })

  const app = express()
  app.use(cors())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, root: ROOT })
  })

  // Current + recent recordings and their lifecycle status, for the client's
  // floating-bar indicator. Cheap enough to poll (a directory scan + small reads).
  app.get('/tasks', (_req, res) => {
    res.json({ tasks: listTasks(ROOT) })
  })

  // Open a recording's folder in the OS file manager. Clicking a task in the
  // client hits this — the browser can't open Finder/Explorer itself.
  app.post('/tasks/:id/reveal', (req, res) => {
    const dir = taskDir(ROOT, req.params.id)
    if (!dir) {
      res.status(404).json({ error: 'unknown recording' })
      return
    }
    openInFileManager(dir)
    res.json({ ok: true, dir })
  })

  app.post('/recordings', upload.any(), async (req, res) => {
    try {
      const meta = JSON.parse((req.body?.meta as string) ?? '{}')
      const files = (req.files as Express.Multer.File[] | undefined) ?? []
      const audio = files.find((f) => f.fieldname === 'audio')?.buffer
      const snapshots = files
        .filter((f) => f.fieldname === 'snapshot')
        .map((f) => ({ name: f.originalname, buffer: f.buffer }))

      const { id, path, hasAudio } = await store.save({ meta, audio, snapshots })
      console.log(
        `[screenshare] saved ${id} — ${meta.events?.length ?? 0} events, ` +
          `audio ${audio ? `${(audio.length / 1024).toFixed(1)}kb` : 'none'}, ` +
          `${snapshots.length} snapshots → ${path}`,
      )
      res.json({ id })

      // After the response: transcribe (if audio), then merge into a timeline.
      void (async () => {
        if (TRANSCRIBE && hasAudio) {
          await transcribeRecording(path, { language: meta.language }, transcriber)
        }
        await correlateRecording(path)
      })()
    } catch (err) {
      console.error('[screenshare] save failed:', err)
      res.status(500).json({ error: String(err) })
    }
  })

  app.listen(PORT, () => {
    console.log(`@getpixel/server listening on http://localhost:${PORT}`)
    console.log(`  recordings → ${join(ROOT, 'inbox')}`)
    console.log(`  transcription: ${TRANSCRIBE ? 'on' : 'off (SCREENSHARE_TRANSCRIBE=0)'}`)
  })
}
