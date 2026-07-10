# Pixel dev container.
# Baked into the image so every Codespace boots with these already present and
# doesn't wait on them at create-time. Repo deps + Playwright browsers are handled
# in devcontainer.json's onCreateCommand (they track the lockfile, so they can't be
# baked here) and are captured by prebuilds.
FROM mcr.microsoft.com/devcontainers/javascript-node:20

# tmux: lets several clients (browser VS Code, desktop VS Code, `gh codespace ssh`)
# attach to ONE shared Claude Code session on the same machine. See README.md.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tmux \
 && rm -rf /var/lib/apt/lists/*

# Claude Code CLI, global.
RUN npm install -g @anthropic-ai/claude-code
