import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { Store } from './store.js'
import { transcribeRecording } from './transcribe.js'
import { correlateRecording } from './correlate.js'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Locate the SKILL.md bundled with THIS package version. Published layout puts it
 * at `<pkg>/skill` (sibling of `dist`); in the dev repo it also lives at the
 * monorepo root `skills/`. Checking the bundled copy first guarantees the skill
 * we install matches the installed @pixel/server version.
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

if (process.argv[2] === 'install-skill') {
  installSkill()
  process.exit(0)
}

const TRANSCRIBE = process.env.SCREENSHARE_TRANSCRIBE !== '0'

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

const PORT = Number(process.env.SCREENSHARE_PORT ?? 41789)
const ROOT = process.env.SCREENSHARE_DIR ?? defaultRoot()

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
        await transcribeRecording(path, { language: meta.language })
      }
      await correlateRecording(path)
    })()
  } catch (err) {
    console.error('[screenshare] save failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`@pixel/server listening on http://localhost:${PORT}`)
  console.log(`  recordings → ${join(ROOT, 'inbox')}`)
  console.log(`  transcription: ${TRANSCRIBE ? 'on' : 'off (SCREENSHARE_TRANSCRIBE=0)'}`)
})
