import { expect, test, type Page } from '@playwright/test'

/**
 * Regression suite for four reported bugs when editing a drop shadow:
 *   1. The alpha/opacity field overflowed its slot and spilled past the popover
 *      right edge (the "%" got clipped).
 *   2. The blend-mode "drop" icon in the header did nothing — removed.
 *   3. The shadow color couldn't be picked visually — the swatch now opens an
 *      SV picker + hue slider, and editing it changes the shadow color.
 *   4. In edit mode the popover's scrub handles / inputs showed the default
 *      cursor (the app-inert `cursor: default !important` rule reached the
 *      body-portaled popover); they must show ew-resize / text again.
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const pane = (page: Page) => page.locator('[aria-label="Design pane"]')
const upgrade = (page: Page) => page.getByRole('button', { name: 'Upgrade' })
const popover = (page: Page) => page.locator('[data-pixel-ui]', { hasText: 'Offset' })

const boxShadow = (page: Page) =>
  upgrade(page).evaluate((el) => (el as HTMLElement).style.boxShadow)

async function openShadowPopover(page: Page): Promise<void> {
  await page.goto('/')
  await editBtn(page).click()
  await upgrade(page).click({ modifiers: ['Meta'] })
  await pane(page).getByTitle('Add effect', { exact: true }).click()
  await pane(page).getByTitle('Edit effect', { exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: 'Shadow blur' })).toBeVisible()
}

// --- Bug 1 -------------------------------------------------------------------

test('Bug 1: the opacity field stays inside the popover', async ({ page }) => {
  await openShadowPopover(page)
  const pop = (await popover(page).boundingBox())!
  // Both the opacity scrub icon and its numeric input sit within the popover.
  for (const sel of ['[aria-label="Scrub shadow opacity"]', '[aria-label="Shadow opacity"]']) {
    const b = (await page.locator(sel).first().boundingBox())!
    expect(b.x).toBeGreaterThanOrEqual(pop.x)
    expect(b.x + b.width).toBeLessThanOrEqual(pop.x + pop.width)
  }
})

// --- Bug 2 -------------------------------------------------------------------

test('Bug 2: the blend-mode "drop" icon is gone', async ({ page }) => {
  await openShadowPopover(page)
  await expect(popover(page).getByRole('button', { name: 'Blend mode' })).toHaveCount(0)
})

// --- Bug 3 -------------------------------------------------------------------

test('Bug 3: the shadow color is editable — swatch opens a picker that changes the color', async ({
  page,
}) => {
  await openShadowPopover(page)

  // Typing a hex applies to the element's shadow color.
  const hex = page.getByRole('textbox', { name: 'Shadow color hex' })
  await hex.fill('FF0000')
  await expect.poll(() => boxShadow(page)).toContain('rgba(255, 0, 0')

  // The swatch opens the visual picker; dragging it changes the color again.
  await popover(page).getByRole('button', { name: 'Pick a color' }).click()
  const sv = page.locator('[aria-label="Color saturation and brightness"]')
  await expect(sv).toBeVisible()
  const b = (await sv.boundingBox())!
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.4)
  await expect.poll(() => boxShadow(page)).not.toContain('rgba(255, 0, 0')
})

// --- Bug 4 -------------------------------------------------------------------

test('Bug 4: scrub handles and inputs keep their cursors in edit mode', async ({ page }) => {
  await openShadowPopover(page)
  const cursor = (sel: string) =>
    page.locator(sel).first().evaluate((el) => getComputedStyle(el as HTMLElement).cursor)

  expect(await cursor('[aria-label="Scrub shadow blur"]')).toBe('ew-resize')
  expect(await cursor('[aria-label="Scrub shadow X"]')).toBe('ew-resize')
  expect(await cursor('[aria-label="Shadow blur"]')).toBe('text')
  expect(await cursor('[aria-label="Shadow color hex"]')).toBe('text')
})
