# Edit Pipeline Refactor — one source of truth for selected-element properties

Status: **in progress** — the bug-fixing core (Phase 1 + Phase 5) is implemented;
the fuller write-path unification (Phases 2–4/6) is staged.
Motivation: undo/redo does not reliably revert design-pane edits. That is a
symptom — the real problem is that a selected element's properties have no single
source of truth and edits reach the DOM through several parallel paths.

> **Implemented in this PR (Phase 1 + Phase 5 — the phases that fix the bug):**
> - `EditHistory.navRevision` — bumped on undo/redo/goto/discard (history
>   *navigation*), NOT on plain commits. The design pane re-derives from the DOM
>   on every nav (`<DesignPanel key={navRevision}>`), so its inputs can no longer
>   drift from what's applied.
> - **Single undo owner.** ⌘Z is handled by the edit history even while a
>   design-pane field is focused — it `preventDefault`s the browser's native
>   text-undo (which used to fight it and desync the DOM), flushes any in-flight
>   debounced edit first (so a quick edit→undo is deterministic), then navigates
>   history. Native undo is preserved only for inline page-text (contentEditable).
> - Tests: unit (`edit-history.test.tsx` — navRevision semantics + flush→undo) and
>   e2e (`editing-full.spec.ts` — undo with the field focused reverts the DOM *and*
>   the pane agrees; debounce-flush determinism).
>
> **Still staged (mechanical, larger, no behavior change):** the formal
> `SelectionModel`/`EditStore` API and routing all ~108 `applyPatch` write sites
> through a single `commit`/`preview` (§4, Phases 2–4/6). The single commit sink
> (history) already unifies recording today, so these are a cleanup, not a
> prerequisite for correct undo.

---

## 1. Current state — what's actually wrong

A selected element's editable properties live in **four** places today, reconciled
only loosely:

| # | Representation | Written by | Read by |
|---|---|---|---|
| **A** | Live **DOM inline styles** (what renders) | `applyPatch`/`applyPatchAll` ([edit/patch.ts](../packages/ui/src/edit/patch.ts)) | everything, eventually |
| **B** | Each design-pane **section's local React state** (`fields`, `flow`, `justify`, gap…) — what the inputs show | `setFields(...)` in each section ([LayoutSection.tsx](../packages/ui/src/properties-sidebar/LayoutSection.tsx) etc.) | that section's inputs |
| **C** | **History** entries (before/after snapshots) | `commit` ([edit/edit-history.tsx](../packages/ui/src/edit/edit-history.tsx)) fed by the debounced `reportPatch` shim ([edit/change-reporter.ts](../packages/ui/src/edit/change-reporter.ts)) | undo/redo, Save |
| **D** | The **browser's native `<input>` undo** stack | the OS, while a pane input is focused | the OS |

The design pane reads **A → B only when the selection changes** (section read-effects
keyed on `elements`; see the memo in [DesignPane.tsx:42-48](../packages/ui/src/DesignPane.tsx#L42-L48)).
An edit writes A + B + C in parallel. **Undo/redo touch only A + C.** D is an
entirely uncontrolled fourth writer.

### 1.1 Reproduced failures

Driving the real example app (select `#root`, type `padding-top: 40`, then undo):

1. **Two undo stacks fight.** `history.undo` is deliberately skipped while a pane
   input is focused ([DesignPane.tsx:110-111](../packages/ui/src/DesignPane.tsx#L110-L111))
   so it won't fight native text-undo. But the inputs are **controlled +
   apply-on-change** ([NumericInput.tsx:105-106](../packages/ui/src/properties-sidebar/NumericInput.tsx#L105-L106)),
   so a native ⌘Z inside the field fires `onChange → applyPatch`, silently mutating
   the DOM **and appending a spurious history entry**. ⌘Z becomes order-dependent.
2. **Drift.** After an undo, the DOM reverts (A) but section state (B) does not, and
   sections don't re-read on history change. Observed: **DOM `padding-top: 40px`
   while the pane input showed empty** — the two disagree.

Drag gestures appear to work only because they commit one clean batch on
pointer-up (`commitChangeBatch`) and you're not typing in a focused input mid-drag,
so they dodge D and the staleness is less visible. Same fragility underneath.

### 1.2 Blast radius (why this is a real refactor)

- **~108 `applyPatch` / `applyPatchAll` / `applyTokenAll` call sites** across **14 files**:
  10 design-pane sections (`LayoutSection`, `PositionSection`, `AppearanceSection`,
  `TypographySection`, `TextColorSection`, `InputSection`, `FillSection`,
  `StrokeSection`, `EffectsSection`, + content/text) and 4 drag modules
  (`drag-session`, `spacing-drag`, `radius-drag`, `reposition-drag`).
- **3 commit entry points:** `reportPatch` (debounced, via the patch pre-hook),
  `commitChangeBatch` (drag pointer-up), and `history.commit` called directly for
  inline text ([Selection.tsx:55-56](../packages/ui/src/Selection.tsx#L55-L56)).
- **Section-local mirror state** duplicated in all 10 sections.

---

## 2. Goal & principles

1. **One source of truth** for the current selection's editable properties: a
   `SelectionModel`. The DOM and the pane inputs are *projections* of it.
2. **One write pipeline.** Every mutation — design pane, drag, inline text — is
   `store.preview(patches)` (live, no history) and/or `store.commit(patches)`
   (atomic: update model → project to DOM → push one history entry). **No component
   mutates the DOM directly.**
3. **History operates on the model.** undo/redo/goto update the model; the DOM and
   the inputs both re-render from it. Drift is impossible by construction.
4. **Preserve everything that works:** multi-edit fan-out (one undo reverts all),
   design-token `source` binding for Save, live drag preview + one-entry-per-gesture
   coalescing, the "Multiple" mixed state, `text`/`html`/`move`/`attr` kinds, and
   the non-destructive override semantics ("edits are a re-applied override layer").
5. **Save is unchanged in spirit:** `buildEditPayload(store.batch)` — the payload is
   still built from the committed entries ([edit/edit-payload.ts](../packages/ui/src/edit/edit-payload.ts)).

---

## 3. The `SelectionModel` (source of truth)

A `PropKey` names an editable surface, mirroring today's `Change`:
`style:<prop>` | `text` | `html` | `attr:<name>` | `move`.

```
SelectionModel {
  elements: HTMLElement[]          // anchor first (from the selection store)
  read(prop: PropKey): Field       // collapsed across the set
}
Field =
  | { kind: 'none' }
  | { kind: 'single'; value: string; explicit: boolean; source?: TokenSource }
  | { kind: 'multiple' }
```

- `read` resolves per element (explicit inline override, else computed) and collapses
  the set to single / multiple — exactly today's `readSharedField` + `readShared`
  logic, moved into one place ([read-shared.ts](../packages/ui/src/properties-sidebar/read-shared.ts),
  [edit/read-explicit.ts](../packages/ui/src/edit/read-explicit.ts),
  [edit/read-computed.ts](../packages/ui/src/edit/read-computed.ts)).
- Built lazily per-prop the sections actually read (memoized), so we don't compute
  every editable property on every selection.
- The model is the **override layer**: edited props are authoritative and re-apply on
  re-render (aligns with the existing non-destructive-override principle). A
  selection change (or an explicit `resync`) rebuilds it from the DOM.

---

## 4. The `EditStore` (one pipeline) — replaces `EditHistoryProvider`

```
EditStore {
  read(prop): Field                              // → the pane inputs & drag reads

  preview(patches: Patch[]): void                // live to DOM, NO history (drag frame, scrub)
  commit(patches: Patch[], label?): void         // atomic: fold preview → model → DOM → 1 entry
  gesture(): { preview, commit }                 // coalesce a typing/drag gesture into ONE entry

  undo(); redo(); goto(n)                         // re-derive model + DOM from entries
  entries; pointer; batch; canUndo; canRedo
  clear(); discard()
}

Patch = { prop: PropKey; value: string; source?: TokenSource;
          scope?: 'all' | HTMLElement[] }        // default 'all selected' (absorbs applyPatchAll)
```

- `commit` folds the multi-edit **peer fan-out** (today spread across
  `applyPatchAll` + `commitChangeBatch`'s `peers`/`peerBefore`) into one place: one
  entry containing every selected element's before/after, so one undo reverts all.
- **Coalescing** (one entry per typing/scrub gesture) moves from the global 350 ms
  timer shim in `change-reporter` into `gesture()` — a gesture previews live and
  commits once on debounce-end / blur / pointer-up.
- `token source` rides on the `Patch` and lands on the entry → Save payload, as today.

---

## 5. Reads: sections bind to the model

Each section drops its `useState` mirror + read-effect and instead selects:

```tsx
const padTop = useProp('style:padding-top')   // Field, from store.read
```

Inputs become **fully controlled by the model** (+ a local *draft* string while
typing, see §6). "Multiple" is just `field.kind === 'multiple'`. This deletes
representation **B** — the single biggest source of drift.

---

## 6. Undo-safe inputs (kill representation D)

Inputs hold a **local draft** string. On keystroke they call `store.preview` (live
feedback) but **only `store.commit` on Enter / blur / scrub-end**. Consequences:

- A native ⌘Z inside a focused field only rewinds the *draft* (and at most the
  preview, which the model re-projects) — it can never desync the DOM or history.
- Because inputs no longer apply-committed-state on every keystroke, the
  **`DesignPane` focus-guard can be removed**: ⌘Z always calls `store.undo` and
  `preventDefault`s the native one. One undo stack.

---

## 7. Migration — phased, each phase shippable & green

- **Phase 0 — scaffold.** Add `SelectionModel` + `EditStore` wrapping the *current*
  history (no behavior change). Model built from DOM on selection. Tests for
  `read`/`commit`/`undo` parity.
- **Phase 1 — reads (fixes drift).** Point the 10 sections' reads at `store.read`;
  delete their mirror state + read-effects; inputs controlled by model + draft.
  *After this phase, undo/redo re-syncs the pane — the reported drift is gone.*
- **Phase 2 — pane writes.** Replace `applyPatchAll`/`applyTokenAll` in the 10
  sections with `store.commit`/`preview`/`gesture`. Retire the `reportPatch`
  debounce shim.
- **Phase 3 — drag.** Route the 4 drag modules through `store.preview` +
  `store.commit`. Delete `setPatchSilent` and `commitChangeBatch`.
- **Phase 4 — inline text/html/move.** Same commit path; remove Selection's direct
  `history.commit`.
- **Phase 5 — undo ownership (fixes ⌘Z).** Draft inputs + always-`store.undo`;
  delete the `DesignPane` focus-guard. Retire `change-reporter.ts`.
- **Phase 6 — cleanup.** `buildEditPayload(store.batch)` (unchanged); delete the
  patch pre-hook, silent flag, and parity stubs.

Phase 1 alone resolves the drift; Phase 5 resolves the ⌘Z collision. Full sequence
delivers the single-source-of-truth architecture.

---

## 8. Regression guardrails (must stay green)

Multi-edit one-undo-reverts-all · token `source` → Save payload · live drag preview
+ single commit per gesture · "Multiple" mixed state · `move`/`text`/`html`/`attr`
kinds · HMR guard during a session · non-destructive override re-apply · automatic
state/props observation.

Existing suites to keep passing: `multi-edit-undo`, `edit-history`,
`spacing-drag`, `spacing-snap-wiring`, `token-source-threading`, `editing`.

---

## 9. Risks & open questions

1. **Cost of building the model** — resolve lazily per read prop, memoized; don't
   snapshot every editable property on each selection.
2. **External DOM mutations** (app re-render, pixel-react time travel) can change an
   element's styles under the model. Today sections re-read on selection + a
   `pixel-drag-frame` tick. Decide the resync trigger: keep an explicit
   `store.resync()` on selection + drag-frame, or add a scoped MutationObserver.
3. **Override-layer semantics** — the model *is* the override layer that must
   re-apply after a host re-render; confirm it composes with the existing
   non-destructive re-apply and never clobbers live app state.
4. **jsdom** computed-style limits — model unit tests lean on explicit inline reads;
   keep DOM-projection assertions in the Playwright integration test.

---

## 10. Test plan

- **Unit:** `read` collapse (single/multiple/none); `commit` updates model + DOM +
  history atomically; undo/redo restores model **and** input display; multi-edit one
  undo reverts every element; token `source` preserved onto the entry; `preview`
  then `commit` = exactly one entry; a simulated native input-undo cannot desync
  (draft-only).
- **Integration (Playwright):** the exact repro from §1.1 — edit padding, ⌘Z
  (focused and blurred), popup undo — DOM and the input stay in agreement at every
  step; drag still one-undo; `buildEditPayload` still emits the right change list
  with `source`.
