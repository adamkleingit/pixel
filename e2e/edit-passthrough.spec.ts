import { expect, test, type Page } from '@playwright/test'

/**
 * Edit-mode mouse tool (passthrough) + the "double-click a button edits it, does
 * not activate it" fix.
 *
 *  - Mouse tool ON (default): the page is inert — Pixel owns pointer input, so
 *    clicking a real button selects it instead of triggering its onClick.
 *  - Mouse tool OFF ('M' or the bar toggle): all mouse/keyboard events pass
 *    through to the real app.
 *  - Toggling back ON re-freezes the page and selection resumes.
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const tool = (page: Page) => bar(page).getByRole('button', { name: 'Mouse tool' })
const openDialog = (page: Page) => page.getByRole('button', { name: 'Open dialog' })
const dialog = (page: Page) => page.getByText('Test dialog')

test('double-clicking a button edits it in place without activating it', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const btn = openDialog(page)
  await btn.click({ modifiers: ['Meta'] }) // select
  await page.waitForTimeout(450)
  await btn.dblclick() // edit — must NOT fire the button's onClick

  await expect
    .poll(() => btn.evaluate((el) => el.getAttribute('contenteditable')))
    .toBe('plaintext-only')
  await expect(dialog(page)).toHaveCount(0) // the dialog never opened
})

test('mouse tool: OFF passes clicks to the app; ON keeps the page inert', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()
  const settings = page.getByRole('link', { name: 'Settings' })
  const dashboard = page.getByRole('link', { name: 'Dashboard' })

  // Default: tool ON → inert. Clicking a real route link does not navigate.
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'true')
  await settings.click()
  await expect(page).toHaveURL(/\/$/)

  // 'M' toggles the tool OFF → passthrough. The link now navigates for real.
  await page.keyboard.press('m')
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'false')
  await settings.click()
  await expect(page).toHaveURL(/\/settings$/)

  // 'M' again → tool ON, page inert again; a link click no longer navigates and
  // selection resumes (the anchor outline appears).
  await page.keyboard.press('m')
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'true')
  await dashboard.click()
  await expect(page).toHaveURL(/\/settings$/) // stayed put — inert again
  await expect(page.locator('.pixel-sel-anchor')).toBeVisible() // selected the link
})

test('mouse tool: the bar toggle mirrors the M shortcut', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'true')
  await tool(page).click()
  await expect(tool(page)).toHaveAttribute('aria-pressed', 'false')
  await openDialog(page).click()
  await expect(dialog(page)).toBeVisible()
})
