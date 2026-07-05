import { expect, test, type Page } from '@playwright/test'

/**
 * Regression suite for five reported design-pane bugs:
 *   1. "Fill" is renamed to "Background" (and still applies a background color).
 *   2. Color picker: only Solid works — the other paint kinds + the Libraries
 *      tab are disabled.
 *   3. Box shadow: offset/blur/spread are settable and DON'T reset when the
 *      pointer hovers the page (the popover used to detach on every re-render).
 *   4. The box-shadow numeric values are drag-scrubbable like the other fields.
 *   5. Clicking outside a box-shadow / color popover closes it (the edit-mode
 *      inert layer used to eat the outside-click before the popover saw it).
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const pane = (page: Page) => page.locator('[aria-label="Design pane"]')
const paneBody = (page: Page) => pane(page).locator('.pixel-pane-body')
const upgrade = (page: Page) => page.getByRole('button', { name: 'Upgrade' })
// A card has a SOLID background (hsl(var(--background))), so the Background
// section shows an editable color swatch — unlike the gradient-backed buttons,
// which the pane now renders as a display-only preview row.
const inboxCard = (page: Page) => page.locator('.card', { hasText: 'Inbox' })

const styleOf = (page: Page, prop: string) =>
  upgrade(page).evaluate((el, p) => (el as HTMLElement).style.getPropertyValue(p), prop)

async function enterEdit(page: Page, select?: () => Promise<unknown>): Promise<void> {
  await page.goto('/')
  await editBtn(page).click()
  await expect(pane(page)).toBeVisible()
  // Default: Cmd+click the exact button leaf so the pane inspects it.
  await (select ? select() : upgrade(page).click({ modifiers: ['Meta'] }))
  await expect(page.locator('.pixel-pane-tag')).toBeVisible()
}

/** Enter edit mode with a solid-background card selected (top-padding corner is
 *  child-free, so Cmd+click lands on the card div itself). */
const enterEditOnSolid = (page: Page) =>
  enterEdit(page, () => inboxCard(page).click({ modifiers: ['Meta'], position: { x: 8, y: 8 } }))

const bgSection = (page: Page) => paneBody(page).locator('[data-section="background"]')

/** Open the Background paint popover (click its paint swatch). */
async function openBackgroundPopover(page: Page): Promise<void> {
  await bgSection(page).getByTitle('Edit paint').first().click()
  await expect(page.getByRole('button', { name: 'Solid' })).toBeVisible()
}

/** Add a drop shadow and open its editor popover. */
async function openShadowPopover(page: Page): Promise<void> {
  await pane(page).getByTitle('Add effect', { exact: true }).click()
  await pane(page).getByTitle('Edit effect', { exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: 'Shadow blur' })).toBeVisible()
}

// --- Bug 1 -------------------------------------------------------------------

test('Bug 1: the Fill section is renamed to Background and edits a solid background color', async ({
  page,
}) => {
  await enterEditOnSolid(page)
  await expect(bgSection(page)).toBeVisible()
  await expect(bgSection(page).getByText('Background', { exact: true })).toBeVisible()
  await expect(paneBody(page).locator('[data-section="fill"]')).toHaveCount(0)

  // A solid background is editable inline — typing a hex applies background-color.
  await bgSection(page).locator('input[type="text"]').first().fill('123456')
  await expect
    .poll(() => inboxCard(page).evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor))
    .toBe('rgb(18, 52, 86)')
})

// --- Bug 2 -------------------------------------------------------------------

test('Bug 2: the Background picker enables solid/gradient/image; video/pattern stay disabled', async ({
  page,
}) => {
  // NOTE: the original "solid-only" behavior was superseded by the full-paint
  // Background editor (gradient + image are now editable). Video/pattern remain
  // disabled placeholders.
  await enterEditOnSolid(page)
  await openBackgroundPopover(page)

  for (const kind of ['Solid', 'Gradient', 'Image']) {
    await expect(page.getByRole('button', { name: kind })).toBeEnabled()
  }
  for (const kind of ['Video', 'Pattern']) {
    await expect(page.getByRole('button', { name: kind })).toBeDisabled()
  }
})

// --- Bug 3 -------------------------------------------------------------------

test('Bug 3: box-shadow offset/blur/spread are settable and survive a page hover', async ({
  page,
}) => {
  await enterEdit(page)
  await openShadowPopover(page)

  await page.getByRole('textbox', { name: 'Shadow X' }).fill('5')
  await page.getByRole('textbox', { name: 'Shadow blur' }).fill('20')
  await page.getByRole('textbox', { name: 'Shadow spread' }).fill('3')
  await expect.poll(() => styleOf(page, 'box-shadow')).toContain('20px')

  // Hovering the page used to re-read + reset the popover (new row id → detach).
  await page.getByRole('button', { name: 'Compose' }).hover()

  // The popover is still open, the values persist, and the DOM keeps the shadow.
  await expect(page.getByRole('textbox', { name: 'Shadow blur' })).toHaveValue('20')
  await expect(page.getByRole('textbox', { name: 'Shadow spread' })).toHaveValue('3')
  await expect.poll(() => styleOf(page, 'box-shadow')).toContain('20px')
})

// --- Bug 4 -------------------------------------------------------------------

test('Bug 4: box-shadow numeric values are drag-scrubbable', async ({ page }) => {
  await enterEdit(page)
  await openShadowPopover(page)

  const before = Number(await page.getByRole('textbox', { name: 'Shadow blur' }).inputValue())
  const scrub = page.locator('[aria-label="Scrub shadow blur"]')
  const b = (await scrub.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()

  await expect
    .poll(async () => Number(await page.getByRole('textbox', { name: 'Shadow blur' }).inputValue()))
    .toBeGreaterThan(before + 10)
})

// --- Bug 5 -------------------------------------------------------------------

test('Bug 5: clicking outside a box-shadow popover closes it', async ({ page }) => {
  await enterEdit(page)
  await openShadowPopover(page)
  const blur = page.getByRole('textbox', { name: 'Shadow blur' })
  await expect(blur).toBeVisible()

  // Click the page well away from the right-docked pane + the popover.
  await page.mouse.click(80, 80)
  await expect(blur).toHaveCount(0)
})

test('Bug 5: clicking outside the color popover closes it', async ({ page }) => {
  await enterEditOnSolid(page)
  await openBackgroundPopover(page)
  const solid = page.getByRole('button', { name: 'Solid' })
  await expect(solid).toBeVisible()

  await page.mouse.click(80, 80)
  await expect(solid).toHaveCount(0)
})
