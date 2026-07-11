#!/usr/bin/env bash
# newfeat
#
# From nothing to a running Claude Code agent in one command:
#   1. spin up a fresh Codespace on the latest main
#   2. drop you into a Claude Code session on that box
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

# 2. Wait until the box accepts SSH. A fresh (un-prebuilt) box is still running
#    onCreate setup (npm ci + Playwright), during which the SSH RPC times out with
#    "DeadlineExceeded". Prebuilds make this near-instant.
echo -n "• waiting for the box to accept SSH"
for _ in $(seq 1 40); do
  if gh codespace ssh -c "$CS" -- true >/dev/null 2>&1; then
    echo " — ready"
    break
  fi
  echo -n "."
  sleep 10
done

# 3. SSH in with a TTY and launch Claude Code in the repo.
exec gh codespace ssh -c "$CS" -- -t 'cd /workspaces/pixel && exec claude'
