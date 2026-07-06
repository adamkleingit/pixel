import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { INBOX_DIR, PIXEL_DIR, settleLayout, stableBox } from './fixtures'

/** Poll the dropbox until an edit task (edits.json + ready timeline.json) lands. */
async function waitForEditTask(timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let ids: string[] = []
    try {
      ids = await readdir(INBOX_DIR)
    } catch {
      /* inbox not created yet */
    }
    for (const id of ids) {
      const dir = join(INBOX_DIR, id)
      if (existsSync(join(dir, 'edits.json')) && existsSync(join(dir, 'timeline.json'))) return id
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no edit task appeared in ${INBOX_DIR} within ${timeoutMs}ms`)
}

// Scope to the pixel bar — the example app has its own "Edit" button.
type PWPage = import('@playwright/test').Page
const editBtn = (page: PWPage) =>
  page.locator('.pixel-rec').getByRole('button', { name: 'Edit' })
// In edit mode the pencil is replaced by Save/Cancel (editing/recording are
// separated). These are the bar's edit-mode controls + the "is editing" marker.
const saveBtn = (page: PWPage) => page.locator('.pixel-rec').getByRole('button', { name: 'Save' })
const cancelBtn = (page: PWPage) =>
  page.locator('.pixel-rec').getByRole('button', { name: 'Cancel' })
const editingBar = (page: PWPage) => page.locator('.pixel-rec.editing')

test.beforeEach(async () => {
  // The composition test records (and uploads) — start from a clean dropbox.
  await rm(PIXEL_DIR, { recursive: true, force: true })
})

test('the Edit pencil enters and exits edit mode', async ({ page }) => {
  await page.goto('/')
  const edit = editBtn(page)
  await expect(edit).toHaveAttribute('aria-pressed', 'false')

  await edit.click()
  // The pencil is replaced by Save/Cancel while editing.
  await expect(editingBar(page)).toBeVisible()
  await expect(edit).toHaveCount(0)
  await expect(saveBtn(page)).toBeVisible()

  // Cancel (X) exits edit mode; the pencil returns.
  await cancelBtn(page).click()
  await expect(editBtn(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(editingBar(page)).toHaveCount(0)
})

test('double-tap Enter enters edit mode; Esc exits', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press('Enter')
  await page.waitForTimeout(60)
  await page.keyboard.press('Enter')
  await expect(editingBar(page)).toBeVisible()

  await page.keyboard.press('Escape') // Esc = Cancel → exits edit
  await expect(editBtn(page)).toHaveAttribute('aria-pressed', 'false')
})

test('recording and editing are separated in the bar', async ({ page }) => {
  await page.goto('/')
  const status = page.locator('.status')

  // While recording, the Edit pencil is hidden.
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(status).toHaveClass(/recording/)
  await expect(editBtn(page)).toHaveCount(0)

  // Stop the recording (double-tap Space).
  await page.waitForTimeout(800)
  await page.keyboard.press('Space')
  await page.waitForTimeout(80)
  await page.keyboard.press('Space')
  await expect(status).not.toHaveClass(/recording/, { timeout: 15_000 })

  // Idle again → the Edit pencil returns.
  await expect(editBtn(page)).toBeVisible()

  // Entering edit hides the bar's Rec button and shows Save/Cancel.
  await editBtn(page).click()
  await expect(page.locator('.pixel-rec-record')).toHaveCount(0)
  await expect(saveBtn(page)).toBeVisible()
  await expect(cancelBtn(page)).toBeVisible()
})

test('selection: Cmd+click picks the exact element under the pointer', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.getByRole('button', { name: 'Upgrade' })
  await target.click({ modifiers: ['Meta'] }) // Cmd → exact leaf

  const anchor = page.locator('.pixel-sel-anchor')
  await expect(anchor).toBeVisible()

  // The anchor outline overlays the clicked element's box.
  const a = await target.boundingBox()
  const b = await anchor.boundingBox()
  expect(a).not.toBeNull()
  expect(b).not.toBeNull()
  expect(Math.abs(a!.x - b!.x)).toBeLessThanOrEqual(3)
  expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(3)
  expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(3)
  expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(3)

  // Escape clears the selection (still editing — two-stage Escape).
  await page.keyboard.press('Escape')
  await expect(anchor).toHaveCount(0)
  await expect(editingBar(page)).toBeVisible()
})

test('selection: hovering draws a hover outline', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  await page.getByRole('button', { name: 'Upgrade' }).hover()
  await expect(page.locator('.pixel-sel-hover')).toBeVisible()
})

test('selection: double-click drills inward (outside → inside)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.getByRole('button', { name: 'Upgrade' })
  const anchor = page.locator('.pixel-sel-anchor')

  // Plain click → selects the outermost level (anchored at the app root).
  await target.click()
  await expect(anchor).toBeVisible()
  const outer = await anchor.boundingBox()

  // Repeated double-clicks drill deeper; drilling caps at the leaf under the
  // pointer, so it converges on the clicked button's own box.
  for (let i = 0; i < 6; i++) await target.dblclick()
  const inner = await anchor.boundingBox()
  const leaf = await target.boundingBox()
  expect(outer).not.toBeNull()
  expect(inner).not.toBeNull()
  expect(leaf).not.toBeNull()
  expect(inner!.width).toBeLessThan(outer!.width) // drilled inward
  // ...all the way to the clicked element.
  expect(Math.abs(inner!.x - leaf!.x)).toBeLessThanOrEqual(3)
  expect(Math.abs(inner!.width - leaf!.width)).toBeLessThanOrEqual(3)
})

test('selection: Shift+click adds a second element (multi-select)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Cmd+click one button (exact), then Shift+click a peer at the same depth.
  await page.getByRole('button', { name: 'Upgrade' }).click({ modifiers: ['Meta'] })
  await page.getByRole('button', { name: 'Compose' }).click({ modifiers: ['Shift'] })

  await expect(page.locator('.pixel-sel-anchor')).toHaveCount(1)
  await expect(page.locator('.pixel-sel-match')).toHaveCount(1)
})

test('multi-edit: double-click edits the text of every selected element', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const inboxP = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  const billingP = page.locator('.card', { hasText: 'Billing' }).locator('p')

  // Select both card blurbs (same depth), then double-click one to edit ALL.
  await inboxP.click({ modifiers: ['Meta'] })
  await billingP.click({ modifiers: ['Shift'] })
  await expect(page.locator('.pixel-sel-match')).toHaveCount(1)

  await inboxP.dblclick()
  await page.keyboard.type('Shared copy')
  await page.keyboard.press('Enter') // commit

  await expect(inboxP).toHaveText('Shared copy')
  await expect(billingP).toHaveText('Shared copy')

  // One atomic entry — a single undo reverts both.
  await page.keyboard.press('ControlOrMeta+z')
  await expect(inboxP).toHaveText('Triage messages and assign owners.')
  await expect(billingP).toHaveText('Plans, invoices, and payment methods.')
})

test('multi-edit: dragging a resize handle resizes every selected element', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const upgrade = page.getByRole('button', { name: 'Upgrade' })
  const compose = page.getByRole('button', { name: 'Compose' })
  await upgrade.click({ modifiers: ['Meta'] }) // anchor
  await compose.click({ modifiers: ['Shift'] }) // peer
  const beforeUpgrade = (await upgrade.boundingBox())!.width
  const beforeCompose = (await compose.boundingBox())!.width

  // Drag the anchor's right edge — the peer resizes with it.
  const handle = page.locator('[data-resize-handle="edge"][data-side="right"]')
  await expect(handle).toBeVisible()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 60, hb.y + hb.height / 2, { steps: 6 })
  await page.mouse.up()

  expect((await upgrade.boundingBox())!.width).toBeGreaterThan(beforeUpgrade + 20)
  expect((await compose.boundingBox())!.width).toBeGreaterThan(beforeCompose + 20)
  expect(await compose.evaluate((b) => (b as HTMLElement).style.width)).not.toBe('')
})

test('multi-edit: moving is disabled — dragging the body keeps the selection intact', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  const upgrade = page.getByRole('button', { name: 'Upgrade' })
  await upgrade.click({ modifiers: ['Meta'] })
  await page.getByRole('button', { name: 'Compose' }).click({ modifiers: ['Shift'] })
  await expect(page.locator('.pixel-sel-match')).toHaveCount(1)

  // Press + drag the body of a selected element. Move is disabled for multi, so
  // the selection is preserved (not collapsed to one) and nothing is repositioned.
  const box = (await upgrade.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40, { steps: 8 })
  await page.mouse.up()

  await expect(page.locator('.pixel-sel-anchor')).toHaveCount(1)
  await expect(page.locator('.pixel-sel-match')).toHaveCount(1) // still multi
  expect(await upgrade.evaluate((b) => (b as HTMLElement).style.position)).not.toBe('absolute')
})

test('design pane: docks on the right, shrinks the body, collapses, and restores on exit', async ({
  page,
}) => {
  await page.goto('/')
  const pane = page.locator('[aria-label="Design pane"]')
  const marginRight = () => page.evaluate(() => document.documentElement.style.marginRight)

  // Appears immediately on entering edit mode, and shrinks the body (not float).
  await editBtn(page).click()
  await expect(pane).toBeVisible()
  expect(await marginRight()).toBe('280px')

  // Inspects the selected element.
  await page.getByRole('button', { name: 'Upgrade' }).click({ modifiers: ['Meta'] })
  await expect(page.locator('.pixel-pane-tag')).toBeVisible()

  // Collapse → frees the reserved width (like the recording menu's minimize).
  await page.locator('[aria-label="Design pane"] .pixel-pane-collapse').click()
  await expect(page.locator('[aria-label="Design pane"].collapsed')).toBeVisible()
  expect(await marginRight()).toBe('0px')

  // Expand again restores the width; exiting edit restores the original margin.
  await page.locator('[aria-label="Design pane"] .pixel-pane-collapse').click()
  expect(await marginRight()).toBe('280px')
  await cancelBtn(page).click() // exit edit
  await expect(pane).toHaveCount(0)
  expect(await marginRight()).toBe('')
})

test('the mouse tool is hidden when not recording', async ({ page }) => {
  await page.goto('/')
  // Idle: the bar is shown but the mouse tool (a recording-only control) isn't.
  await expect(page.locator('.pixel-rec')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mouse tool' })).toHaveCount(0)
})

test('selection outline recalculates when the design pane collapses (body reflows)', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.getByRole('button', { name: 'Upgrade' })
  await target.click({ modifiers: ['Meta'] })
  const anchor = page.locator('.pixel-sel-anchor')
  await expect(anchor).toBeVisible()

  // Collapse the pane → the body widens and the element shifts. The outline
  // must follow it (this is the bug fix — it used to go stale).
  await page.locator('[aria-label="Design pane"] .pixel-pane-collapse').click()
  await page.waitForTimeout(300) // margin transition + reflow

  const t = await target.boundingBox()
  const a = await anchor.boundingBox()
  expect(t).not.toBeNull()
  expect(a).not.toBeNull()
  expect(Math.abs(t!.x - a!.x)).toBeLessThanOrEqual(3)
  expect(Math.abs(t!.y - a!.y)).toBeLessThanOrEqual(3)
  expect(Math.abs(t!.width - a!.width)).toBeLessThanOrEqual(3)
})

test('design pane is resizable by dragging its left edge', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const pane = page.locator('[aria-label="Design pane"]')
  const before = (await pane.boundingBox())!.width
  expect(Math.round(before)).toBe(280)

  const hb = (await page.locator('[aria-label="Design pane"] .pixel-pane-resize').boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 120)
  await page.mouse.down()
  await page.mouse.move(hb.x - 80, hb.y + 120, { steps: 6 }) // drag left → wider
  await page.mouse.up()

  const after = (await pane.boundingBox())!.width
  expect(after).toBeGreaterThan(before + 40)
  // The reserved body width tracks the new pane width.
  expect(await page.evaluate(() => document.documentElement.style.marginRight)).toBe(
    `${Math.round(after)}px`,
  )
})

test('edit mode inerts the page: a nav link does not navigate while editing', async ({ page }) => {
  await page.goto('/')
  const settings = page.getByRole('link', { name: 'Settings' })

  // Enter edit mode → the page is inert.
  await editBtn(page).click()
  await expect(editingBar(page)).toBeVisible()

  // Clicking a real route link must NOT navigate (the click is swallowed). It
  // does select the link (selection model), so we exit via Cancel rather than
  // Escape (Escape would just clear the selection — two-stage).
  await settings.click()
  await expect(page).toHaveURL(/\/$/)

  // Exit edit mode → the same link navigates normally again.
  await cancelBtn(page).click()
  await expect(editBtn(page)).toHaveAttribute('aria-pressed', 'false')
  await settings.click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('design pane edits commit to the tracker and Cmd+Z undoes them', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Select a text leaf; the real pane's Content section shows its text.
  const p = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await p.click({ modifiers: ['Meta'] })

  const textarea = page.getByRole('textbox', { name: 'Text content' })
  await expect(textarea).toBeVisible()
  await textarea.fill('Edited copy')
  await textarea.blur() // ContentSection commits through the change tracker
  await expect(p).toHaveText('Edited copy')

  // Undo (focus is off the field, so the shortcut applies).
  await page.keyboard.press('ControlOrMeta+z')
  await expect(p).toHaveText('Triage messages and assign owners.')
})

test('Save writes an edit task to the dropbox for the agent to pick up', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Make a real edit through the design pane (a text leaf's Content).
  const p = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await p.click({ modifiers: ['Meta'] })
  const textarea = page.getByRole('textbox', { name: 'Text content' })
  await textarea.fill('Saved copy')
  await textarea.blur()
  await expect(p).toHaveText('Saved copy')

  // Save (diskette) → uploads the batch → the server writes it to the dropbox.
  await saveBtn(page).click()
  await expect(editingBar(page)).toHaveCount(0) // exits edit on success

  // The agent's watch pipeline can claim it: an inbox task with the ready marker
  // (timeline.json) + edits.json carrying our change, located by ancestor chain.
  const id = await waitForEditTask()
  const edits = JSON.parse(await readFile(join(INBOX_DIR, id, 'edits.json'), 'utf8'))
  expect(Array.isArray(edits.changes)).toBe(true)
  const textChange = edits.changes.find((c: { kind: string }) => c.kind === 'text')
  expect(textChange?.after).toBe('Saved copy')
  expect(textChange?.target.at(-1).tag).toBe('p') // innermost descriptor = the <p>
})

test('double-click edits text in place and commits the new text', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const compose = page.getByRole('button', { name: 'Compose' })
  await compose.click({ modifiers: ['Meta'] }) // select the text element
  await page.waitForTimeout(450) // clear the double-tap window vs the select click
  await compose.dblclick() // → inline edit (contenteditable, all selected)
  await page.keyboard.type('Send')
  await page.keyboard.press('Enter') // commit

  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
})

test('resize handle changes the element size and commits (undo reverts)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Stable selector (the text changes elsewhere; the pane also mirrors it in a textarea).
  const target = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await target.click({ modifiers: ['Meta'] }) // select the <p>
  await settleLayout(page) // let the design-pane dock finish reflowing before measuring
  const before = (await target.boundingBox())!.width

  // Pixel's real ResizeHandles render an EdgeBand per resizable side; it's a
  // body-portal div tagged `data-resize-handle="edge"` + `data-side` (no
  // className — Pixel handles are inline-styled).
  const handle = page.locator('[data-resize-handle="edge"][data-side="right"]')
  await expect(handle).toBeVisible()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 60, hb.y + hb.height / 2, { steps: 6 })
  await page.mouse.up()

  const after = (await target.boundingBox())!.width
  expect(after).toBeGreaterThan(before + 20)
  expect(await target.evaluate((e) => (e as HTMLElement).style.width)).not.toBe('')

  // Undo reverts the size. Pixel's drag-session commits the *resolved* pre-drag
  // value as `before` (not an empty inline), so undo restores the element to
  // its original rendered width rather than clearing the inline prop.
  await page.keyboard.press('Meta+z')
  await expect
    .poll(async () => Math.round((await target.boundingBox())!.width))
    .toBe(Math.round(before))
})

test('corner handle resizes both axes and commits (undo reverts)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await target.click({ modifiers: ['Meta'] }) // select the <p>
  await settleLayout(page) // let the design-pane dock finish reflowing before measuring
  const before = await stableBox(target)

  // Pixel's CornerHandle is a body-portal div tagged data-resize-handle="corner".
  // A block child anchors start/start → only the bottom-right corner resizes.
  const corner = page.locator('[data-resize-handle="corner"][data-corner="br"]')
  await expect(corner).toBeVisible()
  const cb = await stableBox(corner) // handle is a portal; wait until it stops repositioning
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
  await page.mouse.down()
  await page.mouse.move(cb.x + 50, cb.y + 40, { steps: 8 })
  await page.mouse.up()

  const after = (await target.boundingBox())!
  expect(after.width).toBeGreaterThan(before.width + 20)
  expect(await target.evaluate((e) => (e as HTMLElement).style.width)).not.toBe('')
  expect(await target.evaluate((e) => (e as HTMLElement).style.height)).not.toBe('')

  // Undo restores the original geometry — one atomic entry reverts width + height
  // together (back to the resolved pre-drag values).
  await page.keyboard.press('Meta+z')
  await expect
    .poll(async () => Math.round((await target.boundingBox())!.width))
    .toBe(Math.round(before.width))
  await expect
    .poll(async () => Math.round((await target.boundingBox())!.height))
    .toBe(Math.round(before.height))
})

test('dragging the element body repositions it (Cmd reorder) and commits (undo reverts)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Pixel's reposition-drag, Cmd mode: dragging an in-flow element shows the
  // insertion line and, on drop past a sibling, reorders it in the flow (an
  // atomic, committed DOM move). We drag the first toolbar button past the
  // second so the order flips. (We drag *directly* — the single pointerdown both
  // selects, Cmd = exact leaf, and arms the move; a separate pre-click would land
  // inside the double-click window and route to inline-edit instead.)
  await settleLayout(page) // let the design-pane dock finish reflowing before measuring
  const toolbar = page.locator('.card', { hasText: 'Inbox' }).locator('.toolbar')
  const order = () => toolbar.evaluate((t) => Array.from(t.children).map((c) => c.textContent))
  expect(await order()).toEqual(['Compose', 'Details'])

  const compose = toolbar.getByRole('button', { name: 'Compose' })
  const box = await stableBox(compose)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // Drag toward "Details"'s actual box (not a fixed offset) so the insertion
  // line lands after it whether the wrapped buttons sit side-by-side or stacked
  // (the design pane narrows the card and can wrap the toolbar).
  const db = await stableBox(toolbar.getByRole('button', { name: 'Details' }))

  await page.keyboard.down('Meta') // Cmd → insertion-line reorder mode
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(db.x + db.width / 2, db.y + db.height * 0.7, { steps: 14 })
  await page.mouse.up()
  await page.keyboard.up('Meta')

  // The element moved in the flow — order flipped.
  await expect.poll(order).toEqual(['Details', 'Compose'])

  // Undo reverts the reposition (one atomic entry restores the original order).
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(order).toEqual(['Compose', 'Details'])
})

test('edit mode normalizes cursors (no pointer on buttons, no not-allowed on disabled)', async ({
  page,
}) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: 'Upgrade' })
  // Not editing: the app's own cursor applies (a button is a pointer).
  expect(await btn.evaluate((b) => getComputedStyle(b).cursor)).toBe('pointer')

  await editBtn(page).click()
  // Editing: neutralized to default everywhere on the app.
  expect(await btn.evaluate((b) => getComputedStyle(b).cursor)).toBe('default')
})

test('the edit log lists changes and its undo/redo + row-jump navigate history', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Make an edit through the pane (a text leaf).
  const p = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await p.click({ modifiers: ['Meta'] })
  const textarea = page.getByRole('textbox', { name: 'Text content' })
  await textarea.fill('Edited copy')
  await textarea.blur()
  await expect(p).toHaveText('Edited copy')

  // Open the edit-log popup from the bar — it lists the one change.
  await page.locator('.pixel-rec').getByRole('button', { name: 'Change history' }).click()
  const log = page.locator('.pixel-editlog')
  await expect(log).toBeVisible()
  await expect(log.locator('.pixel-editlog-item')).toHaveCount(1)
  await expect(log.locator('.pixel-editlog-label')).toContainText('text')

  // Undo from the popup reverts the DOM and dims the entry.
  await log.getByRole('button', { name: /Undo/ }).click()
  await expect(p).toHaveText('Triage messages and assign owners.')
  await expect(log.locator('.pixel-editlog-item.undone')).toHaveCount(1)

  // Clicking the (undone) row jumps back to it via goto → re-applies.
  await log.locator('.pixel-editlog-row').first().click()
  await expect(p).toHaveText('Edited copy')
  await expect(log.locator('.pixel-editlog-item.undone')).toHaveCount(0)
})

test('clicking in the design pane does not close an open app dialog (click-outside contained)', async ({
  page,
}) => {
  await page.goto('/')
  // Open the app's own dialog — it closes on a document `pointerdown` outside it.
  await page.getByRole('button', { name: 'Open dialog' }).click()
  await expect(page.getByText('Test dialog')).toBeVisible()

  // Enter edit mode via the bar (its own clicks are contained → dialog stays).
  await editBtn(page).click()
  await expect(page.locator('[aria-label="Design pane"]')).toBeVisible()
  await expect(page.getByText('Test dialog')).toBeVisible()

  // Click inside the design pane chrome — must NOT bubble to the app's
  // document-level click-outside handler and close the dialog.
  await page.locator('[aria-label="Design pane"] .pixel-pane-title').click()
  await expect(page.getByText('Test dialog')).toBeVisible()
})

test('gap: dragging an automatic value cycles spread modes; ⌘-drag sets a pixel gap', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  const p = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await p.click({ modifiers: ['Meta'] })
  await page.locator('[aria-label="Design pane"]').getByTitle('Horizontal (flex row)').click()
  const justify = () => p.evaluate((el) => getComputedStyle(el).justifyContent)

  // Start on an automatic value: space-between (the right-most spread mode).
  await page.locator('[aria-label="Design pane"]').getByRole('button', { name: 'Open gap menu' }).click()
  await page.getByRole('button', { name: 'Space between' }).click()
  await expect.poll(justify).toBe('space-between')

  const prefix = page.locator('[aria-label="Design pane"] [aria-label="Drag to change gap distribution"]')

  // Drag the gap prefix LEFT → cycles toward the least spread (space-evenly).
  const b1 = (await prefix.boundingBox())!
  const cy = b1.y + b1.height / 2
  await page.mouse.move(b1.x + b1.width / 2, cy)
  await page.mouse.down()
  await page.mouse.move(b1.x - 70, cy, { steps: 8 })
  await page.mouse.up()
  await expect.poll(justify).toBe('space-evenly')

  // ⌘-drag → converts the automatic gap to an explicit px value (exits spread).
  const b2 = (await prefix.boundingBox())!
  const cy2 = b2.y + b2.height / 2
  await page.keyboard.down('Meta')
  await page.mouse.move(b2.x + b2.width / 2, cy2)
  await page.mouse.down()
  await page.mouse.move(b2.x + 40, cy2, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up('Meta')

  await expect.poll(justify).toBe('flex-start')
  await expect
    .poll(() => p.evaluate((el) => parseFloat(getComputedStyle(el).columnGap) || 0))
    .toBeGreaterThan(0)
})

test('Layout gap dropdown applies a spread mode (body-portaled menu works in edit mode)', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  // Select a leaf and make it a flex container so the Gap control appears.
  const p = page.locator('.card', { hasText: 'Billing' }).locator('p')
  await p.click({ modifiers: ['Meta'] })
  await page.locator('[aria-label="Design pane"]').getByTitle('Horizontal (flex row)').click()

  // Open the gap dropdown — its menu is portaled to <body>, OUTSIDE the overlay.
  // The edit-mode click-swallow must not eat the menu item's click (the bug).
  await page.locator('[aria-label="Design pane"]').getByRole('button', { name: 'Open gap menu' }).click()
  await page.getByRole('button', { name: 'Space between' }).click()

  // The selection got justify-content: space-between → the menu click reached it.
  await expect
    .poll(() => p.evaluate((el) => getComputedStyle(el).justifyContent))
    .toBe('space-between')
})

test('double-clicking a text input edits it in place', async ({ page }) => {
  await page.goto('/settings')
  await editBtn(page).click()

  const input = page.locator('input[type="text"]').first()
  await expect(input).toBeVisible()
  await input.dblclick() // form field → edits directly
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Renamed Co.')
  await page.keyboard.press('Enter')

  await expect(input).toHaveValue('Renamed Co.')
})
