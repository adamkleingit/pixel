#!/usr/bin/env bash
# Cursor Cloud environment install — idempotent; may run on every agent start.
set -euo pipefail

npm ci
npx playwright install chromium

# Example app imports @getpixel/ui from dist/, not source — prebuild for fast boot.
npm run build -w @getpixel/ui

# Install Pixel agent skills (canonical source: skills/ at repo root).
mkdir -p .claude/skills
cp -r skills/pixel skills/stop-pixel .claude/skills/

echo "✓ Pixel Cloud bootstrap complete (deps, UI build, pixel + stop-pixel skills)"
