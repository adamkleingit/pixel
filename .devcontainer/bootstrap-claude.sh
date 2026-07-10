#!/usr/bin/env bash
# Runs on every Codespace start (postStartCommand).
#
# Materializes Claude Code OAuth credentials from the CLAUDE_CREDENTIALS_JSON
# Codespaces secret so `claude` is authed with no interactive /login. Using the
# real credentials FILE (not a setup-token) is what keeps /remote-control available
# — see .devcontainer/README.md. If the secret is unset, `claude` just prompts for
# /login on first run.
set -euo pipefail

mkdir -p "$HOME/.claude"

if [ -n "${CLAUDE_CREDENTIALS_JSON:-}" ]; then
  printf '%s' "$CLAUDE_CREDENTIALS_JSON" > "$HOME/.claude/.credentials.json"
  chmod 600 "$HOME/.claude/.credentials.json"
  echo "✓ Claude Code credentials installed (remote-control enabled)"
else
  echo "• CLAUDE_CREDENTIALS_JSON not set — 'claude' will prompt /login on first run."
fi

# Skip first-run onboarding so `claude` drops straight into a session.
if [ ! -f "$HOME/.claude.json" ]; then
  printf '{"hasCompletedOnboarding":true}' > "$HOME/.claude.json"
fi
