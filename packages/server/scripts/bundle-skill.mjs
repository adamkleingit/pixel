// Copy the canonical skills into the server package so they ship in the published
// tarball. This guarantees the SKILL.md files an agent installs match the
// installed @getpixel/server version (same source, same build). Each skill is a
// subfolder — `skill/pixel/SKILL.md`, `skill/stop-pixel/SKILL.md`, …
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', '..', 'skills') // all skills (pixel, stop-pixel, …)
const dest = join(here, '..', 'skill')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log(`bundled skills: ${src} → ${dest}`)
