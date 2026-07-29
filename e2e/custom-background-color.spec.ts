import { expect, test, type Page } from '@playwright/test'

/**
 * Regression: authored `color-mix()` backgrounds must not show as opaque black
 * in the Design pane. The Background section surfaces the raw CSS as a custom
 * paint row (same pattern as Gradient / Image).
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const pane = (page: Page) => page.locator('[aria-label="Design pane"]')
const paneBody = (page: Page) => pane(page).locator('.pixel-pane-body')
const bgSection = (page: Page) => paneBody(page).locator('[data-section="background"]')

const COLOR_MIX = 'color-mix(in srgb, #9333ea 12%, transparent)'

async function injectColorMixBanner(page: Page): Promise<void> {
  await page.evaluate((css) => {
    const el = document.createElement('div')
    el.id = 'pixel-color-mix-banner'
    el.textContent = 'Loading board...'
    Object.assign(el.style, {
      padding: '12px 16px',
      borderRadius: '8px',
      margin: '16px',
      backgroundColor: css,
      border: '1px solid #9333ea',
      font: '14px system-ui',
    })
    document.body.prepend(el)
  }, COLOR_MIX)
}

test('Background shows authored color-mix as a custom value (not #000000)', async ({ page }) => {
  await page.goto('/')
  await injectColorMixBanner(page)
  await editBtn(page).click()
  await expect(pane(page)).toBeVisible()

  const banner = page.locator('#pixel-color-mix-banner')
  await banner.click({ modifiers: ['Meta'], position: { x: 12, y: 12 } })
  await expect(page.locator('.pixel-pane-tag')).toBeVisible()

  await expect(bgSection(page)).toBeVisible()
  // Custom row: label is the authored expression (not a hex field).
  await expect(bgSection(page).getByText(/color-mix/i)).toBeVisible()
  await expect(bgSection(page).locator('input[type="text"]')).toHaveCount(0)

  // Must not lie with opaque black.
  const hexInputs = bgSection(page).locator('input[type="text"]')
  await expect(hexInputs).toHaveCount(0)
  const label = (await bgSection(page).getByRole('button').filter({ hasText: /color-mix/i }).textContent()) ?? ''
  expect(label.toLowerCase()).not.toContain('000000')
})
