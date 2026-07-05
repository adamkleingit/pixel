import { expect, test, type Page } from '@playwright/test'
import { SERVER_URL } from './fixtures'

/**
 * Font design tokens: the example app declares font-family / font-size /
 * font-weight custom properties in globals.css, the server extracts them (with
 * the right `kind`), and the design pane's Typography token pickers let you
 * select them onto an element.
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const pane = (page: Page) => page.locator('[aria-label="Design pane"]')
const typo = (page: Page) => pane(page).locator('[data-section="typography"]')
const inboxHeading = (page: Page) => page.locator('.card', { hasText: 'Inbox' }).locator('h3')

const styleOf = (page: Page, prop: string) =>
  inboxHeading(page).evaluate((el, p) => (el as HTMLElement).style.getPropertyValue(p), prop)

/** Click the nth Typography "Use a token" button and pick the row whose token
 *  name matches `tokenName`. */
async function pickToken(page: Page, tokenBtnIndex: number, tokenName: string): Promise<void> {
  await typo(page).getByRole('button', { name: 'Use a token' }).nth(tokenBtnIndex).click()
  await expect(page.getByPlaceholder('Search tokens')).toBeVisible()
  await page.locator(`button[title*="${tokenName}"]`).click()
}

test('the server extracts font tokens with the right kinds', async ({ request }) => {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${SERVER_URL}/tokens`)
        if (!res.ok()) return 0
        const cache = (await res.json()) as { tokens?: { name: string }[] }
        return cache.tokens?.length ?? 0
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)

  const cache = (await (await request.get(`${SERVER_URL}/tokens`)).json()) as {
    tokens: { name: string; kind: string; value: string }[]
  }
  const has = (kind: string, name: string, value?: string) =>
    cache.tokens.some((t) => t.kind === kind && t.name === name && (value === undefined || t.value === value))

  expect(has('font-family', 'font-sans')).toBe(true)
  expect(has('font-family', 'font-serif')).toBe(true)
  expect(has('font-size', 'text-base', '16px')).toBe(true)
  expect(has('font-size', 'text-2xl', '24px')).toBe(true)
  expect(has('font-weight', 'font-weight-bold', '700')).toBe(true)
})

test('the Typography pickers show font tokens and apply them', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()
  await inboxHeading(page).click({ modifiers: ['Meta'] })
  await expect(page.locator('.pixel-pane-tag')).toHaveText(/<h3/)

  // family, weight, size — line-height / letter-spacing have no tokens, so their
  // buttons are hidden, leaving exactly these three (in this order).
  await expect(typo(page).getByRole('button', { name: 'Use a token' })).toHaveCount(3)

  // Family: pick `font-serif` → the element's font-family stack applies.
  await pickToken(page, 0, 'font-serif')
  await expect.poll(() => styleOf(page, 'font-family')).toContain('Georgia')

  // Weight: pick `font-weight-bold` → 700.
  await pickToken(page, 1, 'font-weight-bold')
  await expect.poll(() => styleOf(page, 'font-weight')).toBe('700')

  // Size: pick `text-2xl` → 24px.
  await pickToken(page, 2, 'text-2xl')
  await expect.poll(() => styleOf(page, 'font-size')).toBe('24px')
})
