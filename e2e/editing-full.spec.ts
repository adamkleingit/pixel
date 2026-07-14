import { expect, test, type Page, type Locator } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { INBOX_DIR, PIXEL_DIR, settleLayout, stableBox } from './fixtures'

/**
 * Thorough sweep of the in-app editing UI: the design pane (every section's
 * controls), the on-canvas handles (resize / spacing / radius / rotate /
 * reposition), the selection model + all modifier keys, multi-edit, inline text,
 * undo/redo, and Save → dropbox. Written to exercise INTENDED behavior so any
 * failure points at a real gap (not to trivially pass).
 */

// --- helpers -----------------------------------------------------------------

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const saveBtn = (page: Page) => bar(page).getByRole('button', { name: 'Save' })
const cancelBtn = (page: Page) => bar(page).getByRole('button', { name: 'Cancel' })
const pane = (page: Page) => page.locator('[aria-label="Design pane"]')
const paneBody = (page: Page) => pane(page).locator('.pixel-pane-body')

/** A design-pane numeric/text field by its aria-label. */
const field = (page: Page, name: string) => pane(page).getByRole('textbox', { name })
/** The element (Appearance) opacity — disambiguated from paint-alpha "Opacity"
 *  fields in Fill/Stroke, which share the same aria-label. Appearance renders
 *  before Fill/Stroke, so it's the first. */
const opacityField = (page: Page) =>
  pane(page).getByRole('textbox', { name: 'Opacity' }).first()

async function enterEdit(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await editBtn(page).click()
  await expect(pane(page)).toBeVisible()
}

/** Cmd+click an element's own box (exact-leaf select). `position` targets a
 *  child-free spot for container elements. */
async function selectExact(loc: Locator, position?: { x: number; y: number }): Promise<void> {
  await loc.click({ modifiers: ['Meta'], position })
}

const inboxCard = (page: Page) => page.locator('.card', { hasText: 'Inbox' })
const inboxP = (page: Page) => inboxCard(page).locator('p')
const inboxToolbar = (page: Page) => inboxCard(page).locator('.toolbar')
const upgrade = (page: Page) => page.getByRole('button', { name: 'Upgrade' })
const compose = (page: Page) => page.getByRole('button', { name: 'Compose' })

const styleOf = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => (el as HTMLElement).style.getPropertyValue(p), prop)
const computed = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el as HTMLElement).getPropertyValue(p), prop)

async function waitForEditTask(timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let ids: string[] = []
    try {
      ids = await readdir(INBOX_DIR)
    } catch {
      /* not created yet */
    }
    for (const id of ids) {
      if (existsSync(join(INBOX_DIR, id, 'edits.json'))) return id
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`no edit task in ${INBOX_DIR} within ${timeoutMs}ms`)
}

/** Drag from the center of `handle` by (dx, dy) with optional modifiers. */
async function dragHandle(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
  modifiers: string[] = [],
): Promise<void> {
  await expect(handle).toBeVisible()
  const b = (await handle.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  for (const m of modifiers) await page.keyboard.down(m)
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 })
  await page.mouse.up()
  for (const m of modifiers) await page.keyboard.up(m)
}

test.beforeEach(async () => {
  await rm(PIXEL_DIR, { recursive: true, force: true })
})

// --- design pane: structure --------------------------------------------------

test('pane: docks, shows the selected tag, and renders tag-appropriate sections', async ({
  page,
}) => {
  await enterEdit(page)
  await selectExact(inboxP(page))
  await expect(page.locator('.pixel-pane-tag')).toHaveText(/<p/)
  const body = paneBody(page)
  for (const s of ['Position', 'Layout', 'Appearance', 'Typography', 'Background', 'Stroke', 'Effects']) {
    await expect(body).toContainText(s)
  }
})

// --- Content -----------------------------------------------------------------

test('Content: editing the textarea changes the element text (and undo reverts)', async ({
  page,
}) => {
  await enterEdit(page)
  await selectExact(inboxP(page))
  const ta = pane(page).getByRole('textbox', { name: 'Text content' })
  await ta.fill('Rewritten copy')
  await ta.blur()
  await expect(inboxP(page)).toHaveText('Rewritten copy')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(inboxP(page)).toHaveText('Triage messages and assign owners.')
})

// --- Typography --------------------------------------------------------------

test('Typography: font size, line height, letter spacing, and text-align apply', async ({
  page,
}) => {
  await enterEdit(page)
  await selectExact(inboxP(page))

  await field(page, 'Font size').fill('22')
  await expect.poll(() => styleOf(inboxP(page), 'font-size')).toBe('22px')

  await field(page, 'Line height').fill('2')
  await expect.poll(() => styleOf(inboxP(page), 'line-height')).not.toBe('')

  await field(page, 'Letter spacing').fill('3')
  await expect.poll(() => styleOf(inboxP(page), 'letter-spacing')).toBe('3px')

  await pane(page).getByTitle('Align center', { exact: true }).click()
  await expect.poll(() => styleOf(inboxP(page), 'text-align')).toBe('center')
})

// --- Appearance --------------------------------------------------------------

test('Appearance: opacity, corner radius, and z-index apply', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))

  await opacityField(page).fill('50')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.5')

  await field(page, 'Corner radius (all)').fill('12')
  await expect.poll(() => styleOf(upgrade(page), 'border-radius')).toBe('12px')

  await field(page, 'Z-index').fill('7')
  await expect.poll(() => styleOf(upgrade(page), 'z-index')).toBe('7')
})

// --- Position ----------------------------------------------------------------

test('Position: rotation applies via the design pane', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await field(page, 'Rotation').fill('30')
  await expect.poll(() => styleOf(upgrade(page), 'transform')).toContain('rotate(30deg)')
})

test('Position: switching mode to Absolute enables X/Y and writes left/top', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  // Open the Position mode dropdown (shows "None"), choose Absolute.
  await pane(page).getByRole('button', { name: 'None', exact: true }).first().click()
  await page.getByRole('button', { name: 'Absolute', exact: true }).click()
  await expect.poll(() => computed(upgrade(page), 'position')).toBe('absolute')

  const x = field(page, 'X position')
  await expect(x).toBeEnabled()
  await x.fill('40')
  await expect.poll(() => styleOf(upgrade(page), 'left')).toBe('40px')
})

// --- Layout (flex container) -------------------------------------------------

test('Layout: selecting the flex toolbar shows the Layout section; padding applies', async ({
  page,
}) => {
  await enterEdit(page)
  await settleLayout(page)
  // Select the toolbar itself (not a button): Cmd-click the empty strip *between*
  // the two buttons. justify-content:space-between opens a gap there; click its
  // exact midpoint (Compose's right edge ↔ Details's left edge) rather than
  // toward the toolbar's right edge — on wider (e.g. Linux) font rendering
  // Details reaches further left and would otherwise swallow the click.
  const cb = await stableBox(compose(page))
  const db = await stableBox(inboxCard(page).getByRole('button', { name: 'Details' }))
  await page.keyboard.down('Meta')
  await page.mouse.click((cb.x + cb.width + db.x) / 2, cb.y + cb.height / 2)
  await page.keyboard.up('Meta')
  await expect(page.locator('.pixel-pane-tag')).toHaveText(/toolbar|<div/)

  // Padding fields are always shown in Layout. (The numeric Gap field is
  // contextual — this toolbar uses justify-content:space-between, so GapField
  // shows the distribution control instead, which is expected.)
  await field(page, 'Padding top').fill('16')
  await expect.poll(() => styleOf(inboxToolbar(page), 'padding-top')).toBe('16px')
  await field(page, 'Padding left').fill('20')
  await expect.poll(() => styleOf(inboxToolbar(page), 'padding-left')).toBe('20px')
})

// --- Fill / Stroke / Effects -------------------------------------------------

test('Background: editing a solid element\'s hex writes background-color', async ({ page }) => {
  await enterEdit(page)
  // A card has a solid background → the Background section shows an editable
  // color row (the child-free top-padding corner selects the card itself).
  await selectExact(inboxCard(page), { x: 8, y: 8 })
  await pane(page).locator('[data-section="background"] input[type="text"]').first().fill('112233')
  await expect.poll(() => styleOf(inboxCard(page), 'background-color')).not.toBe('')
})

test('Stroke: setting a stroke color applies a border', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  // The Stroke section is inline now (no "Add stroke" button): typing a color in
  // the stroke paint row makes the stroke visible with the default 1px weight.
  await pane(page)
    .locator('[data-section="stroke"] input[type="text"]')
    .first()
    .fill('ff0000')
  await expect
    .poll(() => upgrade(page).evaluate((el) => (el as HTMLElement).style.borderWidth))
    .not.toBe('')
})

test('Effects: "Add effect" adds a shadow', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await pane(page).getByTitle('Add effect', { exact: true }).click()
  await expect
    .poll(() => upgrade(page).evaluate((el) => (el as HTMLElement).style.boxShadow))
    .not.toBe('')
})

// --- Input section + inline value edit --------------------------------------

const nameInput = (page: Page) => page.locator('.form-card input[type="text"]').first()

test('Input: double-clicking a text input edits its value in place', async ({ page }) => {
  // The "Acme Inc." text input lives on the /settings route.
  await enterEdit(page, '/settings')
  const input = nameInput(page)
  await input.dblclick() // double-click a field edits its value directly
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('New Co.')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('New Co.')
})

// --- canvas: resize ----------------------------------------------------------

test('canvas resize: right edge grows width; commits inline width', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  const before = (await upgrade(page).boundingBox())!.width
  await dragHandle(page, page.locator('[data-resize-handle="edge"][data-side="right"]'), 60, 0)
  expect((await upgrade(page).boundingBox())!.width).toBeGreaterThan(before + 20)
  await expect.poll(() => styleOf(upgrade(page), 'width')).not.toBe('')
})

test('canvas resize: bottom-right corner grows both axes', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  const before = (await upgrade(page).boundingBox())!
  await dragHandle(page, page.locator('[data-resize-handle="corner"][data-corner="br"]'), 50, 40)
  const after = (await upgrade(page).boundingBox())!
  expect(after.width).toBeGreaterThan(before.width + 15)
  expect(after.height).toBeGreaterThan(before.height + 15)
})

// --- canvas: spacing ---------------------------------------------------------

test('canvas spacing: dragging a padding handle changes padding', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  const padding = () =>
    upgrade(page).evaluate((el) => {
      const s = getComputedStyle(el as HTMLElement)
      return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' ')
    })
  const before = await padding()
  // Spacing handles reveal on hover (~300ms dwell); the hit target is
  // [data-spacing-handle="padding"]. Drag diagonally so whichever side the first
  // handle governs gets a perpendicular component.
  await upgrade(page).hover()
  const handle = page.locator('[data-spacing-handle="padding"]').first()
  await dragHandle(page, handle, 14, 14)
  await expect.poll(padding).not.toBe(before)
})

// --- canvas: corner radius ---------------------------------------------------

test('canvas radius: dragging a corner-radius handle sets the corner radius', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  // Radius dots reveal on hover; a plain drag writes only the grabbed corner's
  // longhand. Grab bottom-right and drag toward center (up-left) to grow it.
  await upgrade(page).hover()
  const handle = page.locator('[data-resize-handle="radius"][data-corner="br"]')
  await dragHandle(page, handle, -16, -16)
  await expect.poll(() => styleOf(upgrade(page), 'border-bottom-right-radius')).not.toBe('')
})

// --- canvas: rotate ----------------------------------------------------------

test('canvas rotate: dragging the rotate handle rotates the element', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  const handle = page.locator('[data-resize-handle="rotate"]').first()
  await dragHandle(page, handle, 24, 24)
  await expect
    .poll(() => upgrade(page).evaluate((el) => (el as HTMLElement).style.transform))
    .toContain('rotate')
})

// --- canvas: reposition ------------------------------------------------------

test('reposition: Cmd-drag reorders an element within its flex parent', async ({ page }) => {
  await enterEdit(page)
  await settleLayout(page)
  const toolbar = inboxToolbar(page)
  const order = () => toolbar.evaluate((t) => Array.from(t.children).map((c) => c.textContent))
  expect(await order()).toEqual(['Compose', 'Details'])

  const box = await stableBox(compose(page))
  const db = await stableBox(inboxCard(page).getByRole('button', { name: 'Details' }))
  await page.keyboard.down('Meta')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Aim past Details' midpoint on BOTH axes (far corner) so the insertion index
  // resolves to "after Details" whether the buttons sit side-by-side (x-axis
  // flow) or wrapped/stacked (y-axis) — dragging only to its center is ambiguous
  // and lands before it on wider font rendering.
  await page.mouse.move(db.x + db.width * 0.85, db.y + db.height * 0.85, { steps: 14 })
  await page.mouse.up()
  await page.keyboard.up('Meta')

  await expect.poll(order).toEqual(['Details', 'Compose'])
})

// --- keyboard move -----------------------------------------------------------

test('keyboard: arrow keys reorder an in-flow element among its siblings', async ({ page }) => {
  await enterEdit(page)
  const toolbar = inboxToolbar(page)
  const order = () => toolbar.evaluate((t) => Array.from(t.children).map((c) => c.textContent))
  await selectExact(compose(page))
  await page.keyboard.press('ArrowRight')
  await expect.poll(order).toEqual(['Details', 'Compose'])
})

// --- selection model + modifiers --------------------------------------------

test('selection: Cmd+click picks the exact leaf; plain hover anchors by depth', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  const anchor = page.locator('.pixel-sel-anchor')
  await expect(anchor).toBeVisible()
  const a = (await upgrade(page).boundingBox())!
  const b = (await anchor.boundingBox())!
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(3)
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(3)
})

test('selection: hover draws a hover outline', async ({ page }) => {
  await enterEdit(page)
  await upgrade(page).hover()
  await expect(page.locator('.pixel-sel-hover')).toBeVisible()
})

test('selection: double-click drills inward toward the leaf', async ({ page }) => {
  await enterEdit(page)
  const target = upgrade(page)
  const anchor = page.locator('.pixel-sel-anchor')
  await target.click()
  await expect(anchor).toBeVisible()
  const outer = (await anchor.boundingBox())!.width
  for (let i = 0; i < 6; i++) await target.dblclick()
  const inner = (await anchor.boundingBox())!.width
  expect(inner).toBeLessThanOrEqual(outer)
})

test('selection: Shift+click builds a multi-selection', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await compose(page).click({ modifiers: ['Shift'] })
  await expect(page.locator('.pixel-sel-anchor')).toHaveCount(1)
  await expect(page.locator('.pixel-sel-match')).toHaveCount(1)
})

test('selection: Escape clears the selection, then exits edit', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await expect(page.locator('.pixel-sel-anchor')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.pixel-sel-anchor')).toHaveCount(0)
  await expect(bar(page).locator('.pixel-rec.editing')).toBeDefined()
  await page.keyboard.press('Escape')
  await expect(editBtn(page)).toHaveAttribute('aria-pressed', 'false')
})

// --- multi-edit --------------------------------------------------------------

test('multi-edit: design-pane change applies to every selected element', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await compose(page).click({ modifiers: ['Shift'] })
  await opacityField(page).fill('40')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.4')
  await expect.poll(() => styleOf(compose(page), 'opacity')).toBe('0.4')
})

test('multi-edit: canvas resize fans out to all selected', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await compose(page).click({ modifiers: ['Shift'] })
  const bu = (await upgrade(page).boundingBox())!.width
  const bc = (await compose(page).boundingBox())!.width
  await dragHandle(page, page.locator('[data-resize-handle="edge"][data-side="right"]'), 60, 0)
  expect((await upgrade(page).boundingBox())!.width).toBeGreaterThan(bu + 20)
  expect((await compose(page).boundingBox())!.width).toBeGreaterThan(bc + 20)
})

test('multi-edit: double-click edits the text of all selected elements', async ({ page }) => {
  await enterEdit(page)
  const billingP = page.locator('.card', { hasText: 'Billing' }).locator('p')
  await selectExact(inboxP(page))
  await billingP.click({ modifiers: ['Shift'] })
  await inboxP(page).dblclick()
  await page.keyboard.type('Unified')
  await page.keyboard.press('Enter')
  await expect(inboxP(page)).toHaveText('Unified')
  await expect(billingP).toHaveText('Unified')
})

// --- undo / redo -------------------------------------------------------------

test('history: Cmd+Z undoes and Cmd+Shift+Z redoes a design-pane edit', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await opacityField(page).fill('30')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.3')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).not.toBe('0.3')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.3')
})

// ⌘Z is owned by the edit history even while a design-pane field is focused
// (the previously-broken case: native text-undo would fight it and desync the
// pane). Undo must revert the DOM *and* the pane input must re-derive from the
// DOM — no drift between what's applied and what the field shows.
test('history: undo with the field focused reverts the DOM and the pane agrees (no drift)', async ({
  page,
}) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  const opacity = opacityField(page)

  await opacity.fill('30') // Playwright leaves focus in the field
  await expect(opacity).toBeFocused() // exercise the exact previously-broken case
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.3')
  await expect.poll(() => opacity.inputValue()).toBe('30')

  // ⌘Z with the field focused → history undo (not a native text-undo).
  await page.keyboard.press('ControlOrMeta+z')
  // DOM reverted…
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).not.toBe('0.3')
  // …and the pane re-read from the DOM: the field no longer shows the stale 30.
  await expect.poll(() => opacityField(page).inputValue()).not.toBe('30')

  // Redo re-applies both the DOM and the pane in lock-step.
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.3')
  await expect.poll(() => opacityField(page).inputValue()).toBe('30')
})

// A quick edit-then-undo must be deterministic despite the 350ms commit debounce:
// ⌘Z flushes the in-flight edit into a committed entry first, then reverts it.
test('history: edit then immediately undo reverts it (debounce is flushed)', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await opacityField(page).fill('40')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.4')
  await page.keyboard.press('ControlOrMeta+z') // no wait for the debounce
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).not.toBe('0.4')
})

// --- Save / Cancel -----------------------------------------------------------

test('Save: writes an edit task carrying the changes to the dropbox', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await opacityField(page).fill('20')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.2')
  await saveBtn(page).click()
  await expect(bar(page).locator('.pixel-rec.editing')).toHaveCount(0)

  const id = await waitForEditTask()
  const edits = JSON.parse(await readFile(join(INBOX_DIR, id, 'edits.json'), 'utf8'))
  const change = edits.changes.find(
    (c: { name: string }) => c.name === 'opacity',
  )
  expect(change?.after).toBe('0.2')
})

test('Cancel: Esc reverts all edits and exits', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await opacityField(page).fill('10')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).toBe('0.1')
  // Esc #1 clears the selection; Esc #2 opens the discard confirm (dirty history).
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(editBtn(page)).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => styleOf(upgrade(page), 'opacity')).not.toBe('0.1')
})
