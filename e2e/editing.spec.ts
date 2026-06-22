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
