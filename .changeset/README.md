# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

`@getpixel/ui` and `@getpixel/server` are versioned in **lockstep** (a `fixed`
group in `config.json`): they always bump and publish together to the same version.

## Adding a changeset (required on every PR that changes the packages)

```bash
npx changeset
```

Pick the bump — **patch** (bug fixes), **minor** (backwards-compatible features),
or **major** (breaking changes) — and write a one-line summary. This writes a
markdown file here that you commit with your PR. CI (`changeset` job) fails a PR
that changes `packages/*` without one.

## What happens on merge to `main`

The `Release` workflow runs on the merge and, in **one** automatic run (no separate
release PR): `changeset version` (apply the bumps, update changelogs, delete the
consumed changesets) → build → `changeset publish` (publish to npm) → commit the bump
back to `main` and push the tags. A merge with no pending changeset publishes nothing.
