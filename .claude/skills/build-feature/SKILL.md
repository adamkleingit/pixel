---
name: build-feature
description: >
  Build a feature end-to-end from a spec: make a plan (get it approved, save it to
  tech-specs/), implement it, add unit + e2e tests, run and fix until everything is
  green, check the README for updates, open a PR, drive CI to green (push fixes
  until it passes), and attach screenshots + a screencast GIF committed in the PR
  branch. Use when the user hands you a feature spec / points you at a spec file and
  wants it built end-to-end, or says "build-feature" / "build this feature" /
  "/build-feature".
---

# Build a feature end-to-end

You are given a **spec** (a file, a paste, or a description). Take it from spec to a
reviewable PR with green CI and visual proof. Work through the steps in order.

**Don't merge the PR** — the human reviews and merges it. (This is about the PR
button, not git strategy.) And when you need to bring `main` into the feature
branch — to get the latest or resolve conflicts — **merge it (`git merge main`),
never rebase.** This project integrates by merge; do not rewrite branch history.

Use a TodoWrite list to track the steps below so progress is visible.

## 1. Plan — and get it approved BEFORE building

- Read the spec. If it's genuinely ambiguous on something that changes the build,
  ask 1–3 tight clarifying questions first (don't over-ask).
- Write an implementation plan to **`tech-specs/<feature-slug>.md`**. Cover: the
  problem, the current-state/root-cause if it's a fix, the design, the exact files
  you'll touch, the test plan (unit + e2e), risks, and — if large — a phased
  breakdown where each phase ships green.
- **Present the plan and get explicit approval before writing any feature code.**
  If you're in plan mode, use ExitPlanMode. Otherwise summarize the plan + the
  saved path and wait for a clear go-ahead. Do not start step 3 until approved.
- Fold any feedback back into the tech-spec.

## 2. Branch

Create a focused branch off `main`: `git checkout -b <feature-slug> main` (or off the
current base if the user specifies). Keep the change tight and reviewable.

## 3. Build the feature

Implement it. Match the surrounding code's style, naming, and comment density. Keep
commits logical. Prefer the smallest coherent change that fully delivers the spec;
if the spec is phased, you may land the bug-fixing / core phases and clearly stage
the rest — but say so explicitly in the plan and PR.

## 4. Add tests — unit AND e2e

- **Unit** (Vitest, `packages/ui/src/**/*.test.tsx`): cover the new logic and the
  specific behavior the spec promises (e.g. an undo actually reverts state).
- **e2e** (Playwright, `e2e/*.spec.ts`): drive the real app and assert the
  user-visible behavior, including the exact scenario the spec is about. Study
  neighboring specs + `e2e/fixtures.ts` for the harness helpers and conventions.
- Write tests that exercise **intended** behavior so a failure means a real gap —
  not tests that trivially pass.

## 5. Run tests → fix → re-run until all green

```bash
npm run typecheck -w @getpixel/ui   # types
npm test                            # unit (vitest run)
npm run test:e2e                    # e2e (playwright; builds @getpixel/ui + starts servers)
npm run test:pack                   # packaging smoke (only if you touched build/exports/files/bin/deps)
```

- Run `test:pack` when the change could affect what ships — a package's `exports`,
  `files`, `bin`, `dependencies`, or the build/bundle output. It packs the tarballs
  and installs them into a clean app; skip it for pure logic/UI changes.

- The e2e harness serves the example on port 5281 and the ingest server on 41890;
  free them first if a stray `npm run dev` holds them:
  `for p in 41890 5281; do lsof -tiTCP:$p -sTCP:LISTEN | xargs kill 2>/dev/null; done`
- Iterate until unit + e2e + typecheck are all clean. A rare drag/pointer e2e can be
  *flaky* (the config retries it) — a "flaky but passed" result is acceptable; an
  actual failure is not.

## 6. Check the README

Read the repo `README.md` (and any package README) and update anything the feature
changes — new config, new install/usage step, new capability, changed behavior.
Skip if nothing is affected, but always look.

## 7. Add a changeset (bump the version)

If the feature changes a **published package** (`packages/ui` or `packages/server`),
add a changeset so the next merge to `main` bumps the version and publishes. CI's
`changeset` job fails a PR that touches `packages/*` without one.

- **Classify the bump** from what actually changed (the two packages version in
  **lockstep** — one bump applies to both):
  - **patch** — bug fixes, internal refactors, no API change.
  - **minor** — new backwards-compatible capability (new prop/export/endpoint,
    additive behavior).
  - **major** — a breaking change (removed/renamed export or prop, changed default,
    anything a consumer must adapt to). Pre-1.0, still call a real break `major`.
- Write the changeset (a file under `.changeset/`, committed with the PR):
  ```bash
  npx changeset            # pick the bump level + a one-line summary
  ```
  Or write `.changeset/<slug>.md` directly:
  ```md
  ---
  '@getpixel/ui': minor
  '@getpixel/server': minor
  ---

  Add <feature>: <one-line, user-facing summary>.
  ```
  List **both** packages at the same level (they're a fixed group). Verify with
  `npx changeset status --since=origin/main` — it must exit clean.
- If the change is infra-only (CI, tests, docs, examples) and touches no package
  source, skip this — no changeset needed, and the gate won't require one.

## 8. Open the PR (don't merge it)

- Commit with a clear message; end it with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Push the branch, then `gh pr create --base main` with a body that explains the
  problem, the change, the tests, and anything deliberately staged. End the body with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Do **not** merge. The human reviews.

## 9. Drive CI to green

```bash
gh pr checks <n> --watch --interval 20
```

If any check fails: open the failing job (`gh run view --log-failed`), fix the cause,
commit, push, and re-watch. **Repeat until every check passes.** Don't hand back a red PR.

## 10. Attach screenshots + a screencast GIF (committed in the PR branch)

Record the working feature and put the media **in this same branch** (not a temp
branch), in a dedicated folder **`demos/<feature-slug>/`**, so it's part of the PR.

1. Record with Playwright against the built app (start the example on a spare port,
   e.g. 5199). Capture a short flow with `recordVideo` **and** a few key
   screenshots. Add a small on-page caption div per step so the clip is
   self-explanatory. Pick a **visually obvious** change (a resize/layout/color shift
   reads far better than a subtle one) and keep both the affected element and the
   relevant pane in frame.
2. Convert the video → an inline-playing GIF with ffmpeg (two-pass palette for
   quality; downscale + ~10fps to keep it lean, aim ≲ 5 MB):
   ```bash
   ffmpeg -y -i demo.webm -vf "fps=10,scale=760:-1:flags=lanczos,palettegen=stats_mode=diff" -update 1 palette.png
   ffmpeg -y -i demo.webm -i palette.png -lavfi "fps=10,scale=760:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" demo.gif
   ```
3. Copy `demo.gif` + the stills into `demos/<feature-slug>/`, commit them to the
   feature branch, and push.
4. Reference them in the PR body (or a follow-up `gh pr comment`) using **raw URLs on
   the feature branch** so the GIF animates inline:
   `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/demos/<feature-slug>/demo.gif`
   Add the stills the same way with short captions (edited state / after-undo /
   redone, etc.).

## Guardrails

- Don't merge the PR — it's for human review. To sync with `main`, `git merge main`
  (never rebase; don't rewrite branch history).
- Keep the diff focused; don't fold in unrelated changes.
- Clean up: stop any dev server you started; keep throwaway scripts in the scratchpad,
  not the repo (only the `demos/<feature-slug>/` media is committed).
- Report honestly: if you staged part of the spec, or a check is flaky, say so.
