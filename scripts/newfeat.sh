#!/usr/bin/env bash
# newfeat
#
# From nothing to a running Claude Code agent in one command:
#   1. spin up a fresh Codespace on the latest main
#   2. drop you into a Claude Code (remote) session on that box
#
# Create the feature branch from inside the session — just ask the agent to.
#
# Requires the `gh` CLI, authenticated (`gh auth login`) with the `codespace` scope.
# Machine size override: NEWFEAT_MACHINE=standardLinux32gb newfeat
set -euo pipefail

REPO="adamkleingit/pixel"
MACHINE="${NEWFEAT_MACHINE:-basicLinux32gb}"   # 4-core / 8GB. `gh codespace create` lists options.

# 1. Create the Codespace on main (prints its generated name on the last line).
echo "• creating codespace on main ($MACHINE)…"
CS="$(gh codespace create -R "$REPO" -b main -m "$MACHINE" | tail -n1)"
echo "✓ codespace $CS"

# 2. SSH in with a TTY and launch Claude Code in remote mode in the repo.
#    (First connect may briefly wait on postStart setup finishing.)
exec gh codespace ssh -c "$CS" -- -t 'cd /workspaces/pixel && exec claude --remote'
