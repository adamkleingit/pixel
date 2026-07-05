import { test, expect, type Page } from '@playwright/test'

/**
 * Picking a color design token (all shadcn tokens are `hsl(...)`) must apply that
 * token's color — not fall back to black — for text color, stroke, and
 * background, and background must *replace* the fill rather than stack a new one.
 * Regression for `rgbStringToHexAlpha` only understanding `rgb()`.
 */

const editBtn = (p: Page) => p.locator('.screenshare-rec').getByRole('button', { name: 'Edit' })
const pane = (p: Page) => p.locator('[aria-label="Design pane"]')
// `.btn.secondary` — a solid white background + a real border, so every color
// section applies (unlike the primary button's gradient fill).
const details = (p: Page) => p.locator('.card', { hasText: 'Inbox' }).getByRole('button', { name: 'Details' })

// hsl(262 83% 58%) — the example's `--primary` — resolves to this rgb.
const PRIMARY = 'rgb(124, 59, 237)'

const style = (loc: ReturnType<typeof details>, prop: string) =>
  loc.evaluate((el, k) => getComputedStyle(el as HTMLElement).getPropertyValue(k), prop)

async function pickPrimaryToken(page: Page, opener: () => Promise<void>) {
  await opener()
  await page.waitForTimeout(200)
  await page.locator('button[title*="primary — hsl"]').first().click({ force: true })
  await page.waitForTimeout(300)
}

test('color token applies to text color', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()
  await details(page).click({ modifiers: ['Meta'] })
  await pickPrimaryToken(page, () =>
    pane(page).getByTitle('Use a color token', { exact: true }).click({ force: true }),
  )
  expect(await style(details(page), 'color')).toBe(PRIMARY)
})

test('color token applies to stroke (and the border is visible)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()
  await details(page).click({ modifiers: ['Meta'] })
  await pickPrimaryToken(page, () =>
    pane(page).locator('[data-section="stroke"]').getByTitle('Use a token').first().click({ force: true }),
  )
  expect(await style(details(page), 'border-top-color')).toBe(PRIMARY)
  expect(parseFloat(await style(details(page), 'border-top-width'))).toBeGreaterThan(0)
})

test('color token replaces the background (one layer, correct color)', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()
  await details(page).click({ modifiers: ['Meta'] })
  const rows = () =>
    pane(page).locator('[data-section="background"] button[title="Edit paint"]').count()
  expect(await rows()).toBe(1)
  await pickPrimaryToken(page, () =>
    pane(page).locator('[data-section="background"]').getByTitle(/Use a token|Change token/).first().click({ force: true }),
  )
  expect(await style(details(page), 'background-color')).toBe(PRIMARY)
  expect(await style(details(page), 'background-image')).toBe('none')
  expect(await rows()).toBe(1) // replaced, not stacked
})
