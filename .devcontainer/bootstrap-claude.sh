#!/usr/bin/env bash
# Runs on every Codespace start (postStartCommand).
#
# Materializes Claude Code OAuth credentials from a Codespaces secret so `claude`
# is authed with no interactive /login. Using the real credentials FILE (not a
# setup-token) is what keeps /remote-control available — see .devcontainer/README.md.
#
# Precedence, matching Claude Code's own auth order:
#   1. CLAUDE_CREDENTIALS_JSON  → real OAuth creds file  (remote-control: YES)
#   2. CLAUDE_CODE_OAUTH_TOKEN  → setup-token env var    (remote-control: NO)
#   3. ANTHROPIC_API_KEY        → API key env var        (remote-control: NO)
set -euo pipefail

mkdir -p "$HOME/.claude"

if [ -n "${CLAUDE_CREDENTIALS_JSON:-}" ]; then
  printf '%s' "$CLAUDE_CREDENTIALS_JSON" > "$HOME/.claude/.credentials.json"
  chmod 600 "$HOME/.claude/.credentials.json"
  echo "✓ Claude Code credentials installed from CLAUDE_CREDENTIALS_JSON (remote-control enabled)"
elif [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "✓ Using CLAUDE_CODE_OAUTH_TOKEN (remote-control disabled)"
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "✓ Using ANTHROPIC_API_KEY (remote-control disabled)"
else
  echo "⚠ No Claude auth secret set. Run 'claude' then /login once, or add a secret."
fi

# Skip first-run onboarding so `claude` drops straight into a session.
if [ ! -f "$HOME/.claude.json" ]; then
  printf '{"hasCompletedOnboarding":true}' > "$HOME/.claude.json"
fi
