#!/usr/bin/env bash
# newfeat <branch-name>
#
# From nothing to a running Claude Code agent in one command:
#   1. create <branch-name> off the latest main
#   2. spin up a fresh Codespace on it
#   3. drop you into a Claude Code session on that box
#
# Requires the `gh` CLI, authenticated (`gh auth login`).
# Machine size override: NEWFEAT_MACHINE=standardLinux32gb newfeat my-branch
set -euo pipefail

REPO="adamkleingit/pixel"
BRANCH="${1:?usage: newfeat <branch-name>}"
MACHINE="${NEWFEAT_MACHINE:-basicLinux32gb}"   # 4-core / 8GB. `gh codespace create` lists options.

# 1. Branch off latest main (no-op if it already exists).
BASE_SHA="$(gh api "repos/$REPO/git/ref/heads/main" -q .object.sha)"
if gh api "repos/$REPO/git/refs" -f ref="refs/heads/$BRANCH" -f sha="$BASE_SHA" >/dev/null 2>&1; then
  echo "✓ created branch $BRANCH"
else
  echo "• branch $BRANCH already exists — reusing"
fi

# 2. Create the Codespace (prints its generated name on the last line).
echo "• creating codespace on $BRANCH ($MACHINE)…"
CS="$(gh codespace create -R "$REPO" -b "$BRANCH" -m "$MACHINE" | tail -n1)"
echo "✓ codespace $CS"

# 3. SSH in with a TTY and launch Claude Code in the repo.
#    (First connect may briefly wait on postStart setup finishing.)
exec gh codespace ssh -c "$CS" -- -t 'cd /workspaces/pixel && exec claude'
