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

1. The `Release` workflow opens/updates a **"Version Packages"** PR that runs
   `changeset version` — applying the bumps, updating changelogs, and deleting the
   consumed changeset files.
2. Merging that PR (with no changesets left) triggers the same workflow to run
   `changeset publish`, publishing the new version to npm.
