import { expect, test } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { SCREENSHARE_DIR } from './fixtures'

// Scope to the screenshare bar — the example app has its own "Edit" button.
const editBtn = (page: import('@playwright/test').Page) =>
  page.locator('.screenshare-rec').getByRole('button', { name: 'Edit' })

test.beforeEach(async () => {
  // The composition test records (and uploads) — start from a clean dropbox.
  await rm(SCREENSHARE_DIR, { recursive: true, force: true })
})

test('the Edit pencil enters and exits edit mode', async ({ page }) => {
  await page.goto('/')
  const edit = editBtn(page)
  await expect(edit).toHaveAttribute('aria-pressed', 'false')

  await edit.click()
  await expect(edit).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.screenshare-rec.editing')).toBeVisible()

  await edit.click()
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.screenshare-rec.editing')).toHaveCount(0)
})

test('double-tap Enter enters edit mode; Esc exits', async ({ page }) => {
  await page.goto('/')
  const edit = editBtn(page)

  await page.keyboard.press('Enter')
  await page.waitForTimeout(60)
  await page.keyboard.press('Enter')
  await expect(edit).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('Escape')
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
})

test('editing composes with recording: a recording can run while editing (one session)', async ({
  page,
}) => {
  await page.goto('/')
  const edit = editBtn(page)
  const status = page.locator('.status')

  // Start a recording first (not yet editing → the page's Start button works).
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(status).toHaveClass(/recording/)

  // Enter edit mode while recording — both are now active together (one session).
  // The bar pencil is our own UI, so it's clickable even with the page inert.
  await edit.click()
  await expect(edit).toHaveAttribute('aria-pressed', 'true')
  await expect(status).toHaveClass(/recording/)

  // Stop the recording (double-tap Space — keys aren't swallowed). Editing must
  // survive the recording's lifecycle — it's an independent dimension.
  await page.waitForTimeout(800)
  await page.keyboard.press('Space')
  await page.waitForTimeout(80)
  await page.keyboard.press('Space')
  await expect(status).not.toHaveClass(/recording/, { timeout: 15_000 })
  await expect(edit).toHaveAttribute('aria-pressed', 'true') // edit mode persisted

  // Esc now exits edit mode.
  await page.keyboard.press('Escape')
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
})

test('selection: Cmd+click picks the exact element under the pointer', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.getByRole('button', { name: 'Upgrade' })
  await target.click({ modifiers: ['Meta'] }) // Cmd → exact leaf

  const anchor = page.locator('.screenshare-sel-anchor')
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

  // Escape clears the selection (the bar stays — two-stage Escape).
  await page.keyboard.press('Escape')
  await expect(anchor).toHaveCount(0)
  await expect(editBtn(page)).toHaveAttribute('aria-pressed', 'true')
})

test('selection: hovering draws a hover outline', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  await page.getByRole('button', { name: 'Upgrade' }).hover()
  await expect(page.locator('.screenshare-sel-hover')).toBeVisible()
})

test('selection: double-click drills inward (outside → inside)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.getByRole('button', { name: 'Upgrade' })
  const anchor = page.locator('.screenshare-sel-anchor')

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

  await expect(page.locator('.screenshare-sel-anchor')).toHaveCount(1)
  await expect(page.locator('.screenshare-sel-match')).toHaveCount(1)
})

test('design pane: docks on the right, shrinks the body, collapses, and restores on exit', async ({
  page,
}) => {
  await page.goto('/')
  const pane = page.locator('.screenshare-pane')
  const marginRight = () => page.evaluate(() => document.documentElement.style.marginRight)

  // Appears immediately on entering edit mode, and shrinks the body (not float).
  await editBtn(page).click()
  await expect(pane).toBeVisible()
  expect(await marginRight()).toBe('280px')

  // Inspects the selected element.
  await page.getByRole('button', { name: 'Upgrade' }).click({ modifiers: ['Meta'] })
  await expect(page.locator('.screenshare-pane-tag')).toBeVisible()

  // Collapse → frees the reserved width (like the recording menu's minimize).
  await page.locator('.screenshare-pane-collapse').click()
  await expect(page.locator('.screenshare-pane.collapsed')).toBeVisible()
  expect(await marginRight()).toBe('0px')

  // Expand again restores the width; exiting edit restores the original margin.
  await page.locator('.screenshare-pane-collapse').click()
  expect(await marginRight()).toBe('280px')
  await editBtn(page).click() // exit edit
  await expect(pane).toHaveCount(0)
  expect(await marginRight()).toBe('')
})

test('the mouse tool is hidden when not recording', async ({ page }) => {
  await page.goto('/')
  // Idle: the bar is shown but the mouse tool (a recording-only control) isn't.
  await expect(page.locator('.screenshare-rec')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mouse tool' })).toHaveCount(0)
})

test('selection outline recalculates when the design pane collapses (body reflows)', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  const target = page.getByRole('button', { name: 'Upgrade' })
  await target.click({ modifiers: ['Meta'] })
  const anchor = page.locator('.screenshare-sel-anchor')
  await expect(anchor).toBeVisible()

  // Collapse the pane → the body widens and the element shifts. The outline
  // must follow it (this is the bug fix — it used to go stale).
  await page.locator('.screenshare-pane-collapse').click()
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

  const pane = page.locator('.screenshare-pane')
  const before = (await pane.boundingBox())!.width
  expect(Math.round(before)).toBe(280)

  const hb = (await page.locator('.screenshare-pane-resize').boundingBox())!
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
  const edit = editBtn(page)
  const settings = page.getByRole('link', { name: 'Settings' })

  // Enter edit mode → the page is inert.
  await edit.click()
  await expect(edit).toHaveAttribute('aria-pressed', 'true')

  // Clicking a real route link must NOT navigate (the click is swallowed). It
  // does select the link (selection model), so we exit via the pencil rather
  // than Escape (Escape would just clear the selection — two-stage).
  await settings.click()
  await expect(page).toHaveURL(/\/$/)

  // Exit edit mode → the same link navigates normally again.
  await edit.click()
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
  await settings.click()
  await expect(page).toHaveURL(/\/settings$/)
})

test('design pane edits commit to the tracker and Cmd+Z undoes them', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const btn = page.getByRole('button', { name: 'Upgrade' })
  await btn.click({ modifiers: ['Meta'] }) // select the exact element
  const padInput = page
    .locator('.screenshare-ds-row', { hasText: 'Padding' })
    .locator('input.screenshare-ds-input')
  await expect(padInput).toBeVisible()

  await padInput.fill('30px')
  await padInput.blur() // commit on blur
  await expect
    .poll(() => btn.evaluate((b) => (b as HTMLElement).style.padding))
    .toBe('30px')

  // Undo (focus is off the input, so the shortcut applies).
  await page.keyboard.press('Meta+z')
  await expect
    .poll(() => btn.evaluate((b) => (b as HTMLElement).style.padding))
    .not.toBe('30px')
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

  const target = page.getByText('Triage messages and assign owners.')
  await target.click({ modifiers: ['Meta'] }) // select the <p>
  const before = (await target.boundingBox())!.width

  const handle = page.locator('.screenshare-h-edge[data-side="right"]')
  await expect(handle).toBeVisible()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 60, hb.y + hb.height / 2, { steps: 6 })
  await page.mouse.up()

  const after = (await target.boundingBox())!.width
  expect(after).toBeGreaterThan(before + 20)
  expect(await target.evaluate((e) => (e as HTMLElement).style.width)).not.toBe('')

  // Undo restores the original (no inline width).
  await page.keyboard.press('Meta+z')
  await expect.poll(() => target.evaluate((e) => (e as HTMLElement).style.width)).toBe('')
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
