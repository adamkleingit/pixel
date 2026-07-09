// Provision the packaging smoke test: build the packages, pack them into tarballs,
// and install those tarballs into a CLEAN consumer app that lives OUTSIDE the npm
// workspace. This is what makes the smoke test meaningful — the app consumes the
// exact bytes we'd publish (real `files`/`exports`/`bin`), not the workspace symlink.
//
// Run before the pack playwright config (which boots the installed server + app):
//   node scripts/pack-smoke-setup.mjs && playwright test --config playwright.pack.config.ts
//
// Idempotent: wipes and rebuilds .app + tarballs on every run.

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PACK_DIR = join(ROOT, 'e2e', 'pack')
const FIXTURE_APP = join(PACK_DIR, 'fixture-app')
const APP_DIR = join(PACK_DIR, '.app')
const TARBALL_DIR = join(PACK_DIR, '.tarballs')

const run = (cmd, args, opts = {}) => {
  console.log(`$ ${cmd} ${args.join(' ')}${opts.cwd ? `   (cwd: ${opts.cwd})` : ''}`)
  execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

// 1. Build both packages so dist/ (and the server's bundled skill/) exist to pack.
console.log('\n=== [1/4] Building @getpixel/ui + @getpixel/server ===')
run('npm', ['run', 'build'], { cwd: ROOT })

// 2. Pack each package into a tarball — the same artifact `npm publish` would upload.
console.log('\n=== [2/4] Packing tarballs ===')
rmSync(TARBALL_DIR, { recursive: true, force: true })
mkdirSync(TARBALL_DIR, { recursive: true })
run('npm', ['pack', '-w', '@getpixel/ui', '--pack-destination', TARBALL_DIR], { cwd: ROOT })
run('npm', ['pack', '-w', '@getpixel/server', '--pack-destination', TARBALL_DIR], { cwd: ROOT })

const tarball = (prefix) => {
  const name = readdirSync(TARBALL_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.tgz'))
  if (!name) throw new Error(`no tarball matching ${prefix}*.tgz in ${TARBALL_DIR}`)
  return join(TARBALL_DIR, name)
}
const uiTgz = tarball('getpixel-ui-')
const serverTgz = tarball('getpixel-server-')

// 3. Copy the committed fixture app into a fresh, clean, un-workspaced dir.
console.log('\n=== [3/4] Provisioning clean consumer app ===')
rmSync(APP_DIR, { recursive: true, force: true })
mkdirSync(APP_DIR, { recursive: true })
for (const entry of readdirSync(FIXTURE_APP)) {
  cpSync(join(FIXTURE_APP, entry), join(APP_DIR, entry), { recursive: true })
}

// 4. Install the tarballs (plus the app's own deps) into the clean dir. Running
//    `npm install <tgz>` from APP_DIR — which has no `workspaces` field and isn't
//    matched by the root's workspace globs — installs REAL package copies, not the
//    workspace symlink. That's the whole point.
console.log('\n=== [4/4] Installing tarballs into the clean app ===')
run('npm', ['install', '--no-audit', '--no-fund', uiTgz, serverTgz], { cwd: APP_DIR })

console.log('\n✓ Pack smoke app ready at', APP_DIR)
