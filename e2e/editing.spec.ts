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

test('edit mode inerts the page: a nav link does not navigate while editing', async ({ page }) => {
  await page.goto('/')
  const edit = editBtn(page)
  const settings = page.getByRole('link', { name: 'Settings' })

  // Enter edit mode → the page is inert.
  await edit.click()
  await expect(edit).toHaveAttribute('aria-pressed', 'true')

  // Clicking a real route link must NOT navigate (the click is swallowed).
  await settings.click()
  await expect(page).toHaveURL(/\/$/)

  // Exit edit mode → the same link navigates normally again.
  await page.keyboard.press('Escape')
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
  await settings.click()
  await expect(page).toHaveURL(/\/settings$/)
})
