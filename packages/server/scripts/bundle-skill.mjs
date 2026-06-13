// Copy the canonical skill into the server package so it ships in the published
// tarball. This guarantees `npx @getpixel/server install-skill` writes the SKILL.md
// that matches the installed package version (same source, same build).
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', '..', 'skills', 'pixel')
const dest = join(here, '..', 'skill')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log(`bundled skill: ${src} → ${dest}`)
