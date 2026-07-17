import { execFile } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
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
import {
  emptyCache,
  extractAndCacheTokens,
  readTokenCache,
  resolveProjectDir,
  TOKENS_FILE,
  watchTokenSources,
} from './tokens/extract.js'
import { bugReportEnabled, handleBugReportUpload, listBugReports } from './bug-report.js'

// Load a local `.env` (BLOB_READ_WRITE_TOKEN for bug reports, etc.) if present.
// cwd-relative, so `npm run dev -w @getpixel/server` reads packages/server/.env
// and `npx @getpixel/server` reads the project's .env. No-op without the file.
try {
  process.loadEnvFile?.()
} catch {
  /* no .env — fine */
}

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
 * Locate the directory of skills bundled with THIS package version — it holds one
 * subfolder per skill (`pixel/SKILL.md`, `stop-pixel/SKILL.md`, …). Published
 * layout puts it at `<pkg>/skill` (sibling of `dist`); in the dev repo it lives at
 * the monorepo root `skills/`. Checking the bundled copy first guarantees the
 * skills we install match the installed @getpixel/server version.
 */
function resolveBundledSkillsDir(): string {
  const candidates = [
    join(HERE, '..', 'skill'), // published & post-build: dist/ or src/ → ../skill
    join(HERE, '..', '..', '..', 'skills'), // dev monorepo root
  ]
  const found = candidates.find((c) => existsSync(join(c, 'pixel', 'SKILL.md')))
  if (!found) throw new Error('bundled pixel skills not found')
  return found
}

/**
 * `pixel-server install-skill [--global]` — copy every bundled skill (`pixel`,
 * `stop-pixel`, …) into the Claude Code skills dir (project `.claude/skills` by
 * default, `~/.claude/skills` with `--global`) so they always match the installed
 * package version. This is a Claude Code convenience; other agents can copy the
 * same `node_modules/@getpixel/server/skill/*` folders into their own skills dir.
 */
function installSkills(): void {
  const global = process.argv.includes('--global')
  const base = global
    ? join(homedir(), '.claude', 'skills')
    : join(process.cwd(), '.claude', 'skills')
  const srcDir = resolveBundledSkillsDir()
  for (const name of readdirSync(srcDir)) {
    const from = join(srcDir, name)
    if (!existsSync(join(from, 'SKILL.md'))) continue // skip stray files
    const dest = join(base, name)
    mkdirSync(dest, { recursive: true })
    cpSync(from, dest, { recursive: true })
    console.log(`Installed ${name} skill → ${dest}`)
  }
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
    installSkills()
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
  // `pixel-server bug-reports` — list the bug reports stored in Vercel Blob
  // (needs BLOB_READ_WRITE_TOKEN). Add `--json` for machine-readable output.
  case 'bug-reports': {
    if (!bugReportEnabled()) {
      console.error('bug reporting not configured — set BLOB_READ_WRITE_TOKEN')
      process.exit(1)
    }
    try {
      const reports = await listBugReports()
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(reports, null, 2))
      } else if (reports.length === 0) {
        console.log('No bug reports yet.')
      } else {
        for (const r of reports) {
          console.log(`\n${r.id}`)
          for (const f of r.files) console.log(`  ${(f.size / 1024).toFixed(0)}kb  ${f.url}`)
        }
      }
      process.exit(0)
    } catch (err) {
      console.error(`bug-reports failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
    break
  }
  default:
    startServer()
}

function startServer(): void {
  const TRANSCRIBE = process.env.PIXEL_TRANSCRIBE !== '0'
  const PORT = Number(process.env.PIXEL_PORT ?? 41789)
  const ROOT = resolveRoot()

  // Tests set PIXEL_TRANSCRIBE_MOCK to a fixture path so the pipeline runs
  // end-to-end without loading Whisper / ffmpeg. Unset → the real transcriber.
  const mock = process.env.PIXEL_TRANSCRIBE_MOCK
  const transcriber = mock ? fileTranscriber(mock) : whisperTranscriber

  const store = new Store(ROOT)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  })

  const app = express()

  // In-memory design-token cache — the source of truth for GET /tokens. Seeded
  // on boot (below) and refreshed by the file watcher. Held in memory rather
  // than re-read from disk per request so /tokens keeps serving even if the
  // dropbox dir — where the design-tokens.json mirror is written — is cleared
  // out from under us (e.g. a client/test wiping recordings).
  let liveTokens: Awaited<ReturnType<typeof extractAndCacheTokens>> = null

  app.use(cors())
  // JSON body parsing for the edit-save endpoint. Only parses application/json,
  // so it leaves /recordings' multipart upload (handled by multer) untouched.
  app.use(express.json({ limit: '16mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true, root: ROOT })
  })

  // Current + recent recordings and their lifecycle status, for the client's
  // floating-bar indicator. Cheap enough to poll (a directory scan + small reads).
  app.get('/tasks', (_req, res) => {
    res.json({ tasks: listTasks(ROOT) })
  })

  // The project's design tokens, for the in-app design pane's pickers + drag
  // snap. Served from the cache the boot-time extractor + file watcher maintain
  // (below). Returns an empty set until the first extraction completes.
  app.get('/tokens', (_req, res) => {
    res.json(liveTokens ?? readTokenCache(ROOT) ?? emptyCache())
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
        `[pixel] saved ${id} — ${meta.events?.length ?? 0} events, ` +
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
      console.error('[pixel] save failed:', err)
      res.status(500).json({ error: String(err) })
    }
  })

  // "Report a bug": mint a scoped Vercel Blob client-upload token so the in-app
  // bug button uploads the screen recording directly to Blob. The RW secret
  // stays here; the browser only gets a narrow, short-lived token.
  app.post('/bug-report', handleBugReportUpload)

  // Edit-mode "Save": a JSON batch of changes. Written into the same dropbox as
  // recordings so the agent's `watch` claims it identically — the brief is
  // edits.json instead of timeline.json beats.
  app.post('/edits', async (req, res) => {
    try {
      const payload = (req.body ?? {}) as { url?: string; createdAt?: number; changes?: unknown[] }
      const { id, path, changeCount } = await store.saveEdits(payload)
      console.log(`[pixel] saved edits ${id} — ${changeCount} changes → ${path}`)
      res.json({ id })
    } catch (err) {
      console.error('[pixel] save edits failed:', err)
      res.status(500).json({ error: String(err) })
    }
  })

  // Comment-mode "Save": a JSON batch of pins. Same dropbox / claim pipeline;
  // the brief is comments.json.
  app.post('/comments', async (req, res) => {
    try {
      const payload = (req.body ?? {}) as { url?: string; createdAt?: number; comments?: unknown[] }
      const { id, path, commentCount } = await store.saveComments(payload)
      console.log(`[pixel] saved comments ${id} — ${commentCount} comments → ${path}`)
      res.json({ id })
    } catch (err) {
      console.error('[pixel] save comments failed:', err)
      res.status(500).json({ error: String(err) })
    }
  })

  const server = app.listen(PORT, () => {
    console.log(`@getpixel/server listening on http://localhost:${PORT}`)
    console.log(`  recordings → ${join(ROOT, 'inbox')}`)
    console.log(`  transcription: ${TRANSCRIBE ? 'on' : 'off (PIXEL_TRANSCRIBE=0)'}`)
    console.log(
      `  bug reports: ${bugReportEnabled() ? 'on (POST /bug-report → Vercel Blob)' : 'off (set BLOB_READ_WRITE_TOKEN)'}`,
    )
  })

  // A stale server (often an orphaned `tsx watch` child from a Ctrl+C'd dev run)
  // may still hold the port. Fail with a clear, actionable message instead of an
  // unhandled 'error' crash. `npm run dev` frees the port first (see
  // scripts/free-port.mjs); this is the fallback for other launch paths.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[pixel] Port ${PORT} is already in use — a previous dev server is still running.\n` +
          `  Free it:  lsof -tiTCP:${PORT} -sTCP:LISTEN | xargs kill\n` +
          `  Then re-run.  (npm run dev now frees the port automatically.)\n`,
      )
      process.exit(1)
    }
    throw err
  })

  // Design tokens: extract once on boot, then watch the project's token source
  // files (globals.css / tailwind.config / @theme CSS) and re-extract on change.
  // This is the "watcher creates the design-tokens file and watches for changes"
  // half of the feature; the in-app pane reads it over GET /tokens.
  const projectDir = resolveProjectDir(ROOT)
  void (async () => {
    try {
      const cache = await extractAndCacheTokens(projectDir, ROOT)
      liveTokens = cache
      if (cache) {
        console.log(
          `  design tokens: ${cache.tokens.length} (${cache.adapterId}) → ${join(ROOT, TOKENS_FILE)}`,
        )
        watchTokenSources(projectDir, ROOT, cache, (next) => {
          liveTokens = next
          console.log(`  design tokens re-extracted: ${next.tokens.length} (${next.adapterId})`)
        })
      } else {
        console.log('  design tokens: none detected')
      }
    } catch (err) {
      console.error('[pixel] token extraction failed:', err)
    }
  })()
}
