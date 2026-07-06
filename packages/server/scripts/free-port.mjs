// Dev helper: free the server's port before `tsx watch` binds it.
//
// `tsx watch` spawns the server as a child process and does NOT reliably kill
// that child when the watcher itself is Ctrl+C'd — so an aborted `npm run dev`
// can leave an orphaned node server still LISTENing on the port. The next run
// then crashes with EADDRINUSE. This script clears both:
//   1. whatever is currently listening on the port, and
//   2. stray `tsx watch src/index.ts` supervisors from prior runs of THIS repo.
//
// POSIX only (uses `lsof` / `pgrep` / `ps`); a no-op elsewhere — the server's
// own EADDRINUSE handler prints a clear message as a fallback.

import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url)) // packages/server/scripts
const repoRoot = resolve(here, '..', '..', '..')
const port = process.argv[2] || process.env.PIXEL_PORT || ''

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch {
    return ''
  }
}

const kill = new Set()

// 1. Anything listening on the port.
if (port) {
  for (const pid of sh(`lsof -tiTCP:${port} -sTCP:LISTEN`).split('\n').map((s) => s.trim()).filter(Boolean)) {
    kill.add(pid)
  }
}

// 2. Stray server watchers belonging to this repo.
for (const pid of sh(`pgrep -f "tsx watch src/index.ts"`).split('\n').map((s) => s.trim()).filter(Boolean)) {
  if (sh(`ps -o command= -p ${pid}`).includes(repoRoot)) kill.add(pid)
}

const killed = []
for (const pid of kill) {
  const n = Number(pid)
  if (n && n !== process.pid) {
    try {
      process.kill(n, 'SIGKILL')
      killed.push(n)
    } catch {
      /* already gone */
    }
  }
}

if (killed.length) console.log(`[predev] freed port ${port} — killed stale server ${killed.join(', ')}`)
