# Codespaces dev environment

A per-feature, disposable cloud box that boots in seconds with **Claude Code, Node,
Playwright (Chromium), and repo deps** already installed, auto-authenticated, and
ready for `/remote-control`.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Base image + tmux + global Claude Code CLI. |
| `devcontainer.json` | Forwarded ports, secrets, `npm ci` + Playwright install, credential bootstrap. |
| `bootstrap-claude.sh` | Runs each start; writes Claude creds from a secret. |
| `../scripts/newfeat.sh` | One command: new branch → new Codespace → running Claude session. |

## One-time setup

### 1. Add the Claude credentials secret
At **https://github.com/settings/codespaces** → *Secrets*, scoped to this repo, add
**`CLAUDE_CREDENTIALS_JSON`** — real OAuth credentials, which auto-auth **and** keep
`/remote-control` working. How to get its value:
  1. Spin up a throwaway Codespace (or any Linux box), run `claude`, do `/login`,
     finish the browser OAuth.
  2. `cat ~/.claude/.credentials.json` — copy the whole JSON blob.
  3. Paste it as the secret value.

(macOS stores these in the Keychain, not a file, so you can't `cat` them on your
Mac — hence the throwaway-box step. If you skip this secret entirely, `claude` just
prompts `/login` on first run.)

Add any other keys your skills need the same way (Vercel token, R2/S3, `GEMINI_API_KEY`,
`ELEVENLABS_API_KEY`, …).

### 2. (Recommended) Turn on prebuilds
Repo → **Settings → Codespaces → Set up prebuild** on `main`. This bakes `npm ci` +
the Playwright browser so new boxes boot in **~10–15s** instead of running install
at create-time.

## Daily use

```bash
# from your Mac, once gh is authed:
scripts/newfeat.sh my-feature-branch
```

That creates the branch off `main`, spins the Codespace, and drops you into
`claude` on the box. Then, e.g. `/build-feature …`.

Or from the GitHub UI: repo → **`<> Code` → Codespaces → Create on `main`**, open a
terminal, run `claude`.

### Live URLs
`npm run dev` starts the example app on **5280** and the Pixel server on **41889**;
both auto-forward to HTTPS URLs (see the Ports panel). The devcontainer *requests*
public visibility, but GitHub sometimes forwards the first time as **private**
(reachable in your own GitHub-authed browser, but not shareable). To make them
truly public:

```bash
gh codespace ports visibility 5280:public 41889:public -c <codespace-name>
```

or toggle each in the Ports panel. Public = anyone with the URL can reach it.

### Multiple sessions on one box
A Codespace is one VM. Attach from browser VS Code, desktop VS Code, and
`gh codespace ssh` at once — they share the filesystem and processes. To share one
*live* Claude session across clients, run it in tmux: `tmux new -s dev` then `claude`;
reattach elsewhere with `tmux attach -t dev`.

### Lifecycle & cost
- **Idle-stops** after 30 min by default (configurable to 4h in your Codespaces
  settings). Stopped = no compute charge, storage only.
- **Auto-deletes** after 30 days stopped.
- Compute **$0.18/hr** (2-core) → up to ~$2.88/hr (32-core); storage $0.07/GB-mo.
  Personal free tier: **120 core-hours + 15 GB-mo/month**.
- Delete the box on merge; the next feature starts clean from this config.
