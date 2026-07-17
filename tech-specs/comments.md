# Comments mode — pin notes for the agent

## Problem

Users can already **record** (voice + clicks) or **edit** the live UI and Save
those changes to the agent. They cannot leave lightweight, place-anchored
**comments** — “this button should be primary”, “tighten this gap” — without
starting a full recording or making visual edits. We need a third mode that
lets them click anywhere, type a note, edit/remove notes, and Save a batch to
the same dropbox the agent already watches.

## Current state

- Idle bar: `[Rec] | [Edit] [Time-travel] | …` — separator between Rec and Edit.
- Two task kinds: `recording` | `edit`. Changelog icons: mic / pencil.
- Element locating for recording clicks (and edit Save targets) is
  `describeElementChain` / `describeElementPath` in
  `packages/ui/src/capture/hittest.ts`.
- Edit Save → `POST /edits` → `edits.json` + `timeline.json` readiness marker.
- **No confirmation dialogs** today — Edit Cancel and Recording Cancel discard
  immediately.
- Onboarding stages: `welcome` | `recording` | `postRecording` | `editing`.

## Design

### Mode model

Add a peer of edit mode: `commenting: boolean` on `PixelProvider` / context.

| Constraint | Behavior |
|---|---|
| Mutual exclusion | **Recording, edit, and comment are mutually exclusive.** Entering one exits the others; while one is active the other two tools are **hidden** from the bar. Keyboard shortcuts respect the same gate (e.g. double-Space won't start a recording while editing/commenting). |
| Mouse tool | On enter: `passthrough = false`. Page clicks are captured for pin placement. |
| Bar layout (idle) | `[Rec] [Edit] [Comment] [Time-travel] …` — **remove** the separator between Rec and Edit. |
| Bar layout (commenting) | Dot + “Commenting” label · Save · Cancel — mirror edit mode (Rec/Edit hidden). |

### Onboarding CTA placement (bugfix)

The editing-tour “Got it” CTA currently centers under the bounding box of *all*
tooltips — including left-side Elements and right-side Design — so it lands in
the middle of the page. Fix: place the CTA under the **dominant tip column**
(the side with more tips / the bar-side stack), just below that column.

### Placing / editing / removing comments

1. Toggle the new **comment** icon (speech-bubble) below the pencil → enter
   comment mode. Cursor becomes a comment cursor
   (`html.pixel-commenting` + custom cursor / crosshair+bubble).
2. Click anywhere on the page (not on Pixel chrome) → place a pin at
   `(clientX, clientY)` and open an inline composer near the pin.
3. Composer: textarea + Delete + Done (or click away to keep draft text).
4. Existing pins: click pin → reopen composer to edit text; Delete removes it.
5. In-session list is the pins themselves (no separate history clock required
   for v1 — Save/Cancel are enough).

Each in-memory comment:

```ts
interface CommentDraft {
  id: string
  x: number
  y: number
  body: string
  target: ElementInfo[]  // describeElementChain at click time
}
```

### Save → agent

Save builds:

```ts
interface CommentRecord {
  target: ElementInfo[]
  body: string
  x: number
  y: number
}
interface CommentPayload {
  url: string
  createdAt: number
  comments: CommentRecord[]
}
```

- UI: `RecordingSink.saveComments?(payload)` → `httpSink` `POST /comments`.
- Server: `Store.saveComments` writes `comments.json`, `meta.json`
  (`kind: 'comment'`, `eventCount`/`commentCount`), and `timeline.json`
  readiness marker — same claim pipeline as edits.
- Agent skill (`skills/pixel/SKILL.md`): branch on `comments.json` like
  `edits.json` — resolve each `target` the same way, treat `body` as the brief.

Empty Save (no comments) is a no-op / disabled button.

### Cancel + confirmation dialogs

New small confirm modal (Pixel chrome, `role="alertdialog"`):

| Action | When to confirm |
|---|---|
| Comment Cancel | Always if ≥1 comment exists (draft or filled). |
| Edit Cancel | Always if the edit history has any committed/pending changes. |
| Esc in either mode | Same gates as the Cancel button. |

Copy (proposed):

- Comment: “Discard N comments?” · Discard · Keep
- Edit: “Discard unsaved edits?” · Discard · Keep

If there is nothing to discard, Cancel exits immediately (no dialog).

### Changelog

Extend `Task.kind` → `'recording' | 'edit' | 'comment'`.

`TaskKindIcon`: speech-bubble icon + `.pixel-tasks-kind.comment` tint
(distinct from mic purple / pencil pink — e.g. amber/teal).

`dropbox.taskMeta` maps on-disk `kind: 'comment'`.

### Onboarding

1. **welcome** — add a callout on `data-pixel-tour="comment"`.
2. New stage **`commenting`** — first time comment mode is entered:
   targets `save`, `cancel-comment` (and optionally a pin tip popup:
   “Click anywhere to leave a comment”).
3. **postRecording** copy → “recordings, edits & comments”.

Persist via existing `pixel:onboarding:v1` flags (`commenting: boolean`).

## Files to touch

### UI (`packages/ui`)

| File | Change |
|---|---|
| `src/types.ts` | `CommentRecord` / `CommentPayload`; `Task.kind` + `saveComments` |
| `src/context.ts` | `commenting`, `toggleComment` / `enterComment` / `exitComment`, saveComments |
| `src/PixelProvider.tsx` | Mode state, mutual exclusion, Esc/confirm wiring, `saveComments` |
| `src/Overlay.tsx` | Comment toggle, commenting bar, remove Rec↔Edit sep, `TaskKindIcon`, confirm modal shell |
| `src/CommentLayer.tsx` (new) | Pins + composer; click-to-place using `describeElementChain` |
| `src/styles.ts` | Commenting cursor, pins, composer, confirm dialog, changelog tint |
| `src/sinks/httpSink.ts` | `POST /comments` |
| `src/onboarding/store.ts` | `commenting` stage |
| `src/onboarding/Onboarding.tsx` | welcome target + commenting stage |
| `src/index.tsx` | Export new types |
| `src/edit/edit-actions.ts` (or shared) | Confirm-gated cancel for edit + comment |

### Server (`packages/server`)

| File | Change |
|---|---|
| `src/store.ts` | `saveComments` |
| `src/index.ts` | `POST /comments` |
| `src/dropbox.ts` | Map `kind: 'comment'` |

### Agent / docs

| File | Change |
|---|---|
| `skills/pixel/SKILL.md` | Recognize `comments.json` tasks |
| `README.md` | Mention comments alongside record/edit if surface-level docs warrant |

### Tests

| File | Coverage |
|---|---|
| `packages/ui/src/comments.test.tsx` (new) | Enter/exit mode; place/edit/delete pin; Save builds payload with targets; Cancel confirm discard/keep; empty Save disabled |
| `packages/ui/src/editing.test.tsx` / Overlay tests | Edit Cancel shows confirm when history non-empty; Keep stays in edit |
| `packages/server/src/store.test.ts` | `saveComments` writes `comments.json` + ready `timeline.json` |
| `packages/server/src/dropbox.test.ts` | `kind: 'comment'` in listTasks |
| `e2e/comments.spec.ts` (new) | Toggle comment tool; place comment on an element; edit text; Save → inbox `comments.json` with `target`; Cancel → confirm → discard; changelog shows comment icon |
| `e2e/editing.spec.ts` | Update Cancel path: confirm dialog when there are edits |

## Test plan

1. **Unit** — mode toggling, payload shape (`target` from hit-test), confirm
   gating (dirty vs clean), TaskKindIcon kind mapping.
2. **Server unit** — dropbox readiness + kind mapping for comments.
3. **e2e** — full happy path in the example app + cancel confirms + changelog
   glyph after save.
4. **typecheck** + unit + e2e green. `test:pack` only if exports/`files`/`bin`
   change in a shipping-relevant way (new public types on the sink — yes if
   `RecordingSink` shape is part of the published API; include a **minor**
   changeset).

## Changeset

**minor** for `@getpixel/ui` + `@getpixel/server` (new capability: comment mode
+ `POST /comments` + new task kind). Lockstep bump.

## Risks

| Risk | Mitigation |
|---|---|
| Click-to-comment fights app hit targets | Same containment as edit/recording: capture while `!passthrough`; skip `.pixel-overlay` / `[data-pixel-ui]`. |
| Pins drift on scroll/resize | Store client coords; v1 is “session viewport” — document that Save should happen before major layout shifts (same practical constraint as recording clicks). |
| Confirm dialogs break existing e2e that Cancel immediately | Update edit e2e Cancel paths; clean Cancel (no edits) stays dialog-free. |
| Agent doesn’t know the new kind | Update `skills/pixel/SKILL.md` in the same PR. |
| Onboarding storage schema | Additive flag; old localStorage merges via `{ ...DEFAULT, ...parsed }`. |

## Phasing

Single PR — all of the above. No staged follow-ups required for the spec as
written.

## Demo / review artifacts

- `demos/comments/` — screencast GIF + stills (idle bar icons, placing a
  comment, edit/remove, Save, changelog icon, cancel confirm).
- Public preview URL of the example app for manual QA before merge.
