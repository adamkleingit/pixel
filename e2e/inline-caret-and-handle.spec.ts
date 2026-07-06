import { expect, test, type Page } from '@playwright/test'

/**
 * Two inline-editing interaction fixes:
 *   1. While editing, clicking inside the text places the caret where you point
 *      (the edit-mode inert layer used to swallow the click, and the resize
 *      handles overlaying the element used to intercept it).
 *   2. Double-clicking a selected element begins inline editing even when the
 *      pointer lands on a resize handle — the only reachable spot on a short
 *      element, whose edge bands cover it top-to-bottom.
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const inboxP = (page: Page) => page.locator('.card', { hasText: 'Inbox' }).locator('p')
const upgrade = (page: Page) => page.getByRole('button', { name: 'Upgrade' })

test('caret: clicking inside the editing text places the caret (not select-all overwrite)', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  const p = inboxP(page)
  await expect(p).toHaveText('Triage messages and assign owners.')

  // Enter inline edit (double-click a text leaf → all text selected).
  await p.click({ modifiers: ['Meta'] })
  await page.waitForTimeout(450)
  await p.dblclick()

  // Click INSIDE the text to place the caret near the start, then type.
  // If the click were swallowed (or eaten by an overlaying handle), the whole
  // selection would remain and the keystroke would overwrite everything.
  await p.click({ position: { x: 24, y: 8 } })
  await page.keyboard.type('Z')
  await page.keyboard.press('Enter') // commit

  const text = await p.textContent()
  expect(text).not.toBe('Z') // caret placed → not a select-all overwrite
  expect(text).toContain('owners') // the tail survived
  expect(text).toContain('Z') // the keystroke landed
})

test('handle double-click: double-clicking a resize handle opens inline editing', async ({
  page,
}) => {
  await page.goto('/')
  await editBtn(page).click()

  // Select the button so its resize handles render over it.
  await upgrade(page).click({ modifiers: ['Meta'] })
  const handle = page.locator('[data-resize-handle="edge"][data-side="right"]')
  await expect(handle).toBeVisible()

  // Double-click the handle itself — this used to only resize (or do nothing);
  // now it begins an inline edit on the element under it.
  await page.waitForTimeout(450) // clear the double-tap window vs the select click
  const b = (await handle.boundingBox())!
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  await page.mouse.click(cx, cy)
  await page.mouse.click(cx, cy) // second click completes the double on the handle

  // The element is now contenteditable (all text selected) — type + commit.
  await expect
    .poll(() => upgrade(page).evaluate((el) => el.getAttribute('contenteditable')))
    .toBe('plaintext-only')
  await page.keyboard.type('Renamed')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: 'Renamed' })).toBeVisible()
})
