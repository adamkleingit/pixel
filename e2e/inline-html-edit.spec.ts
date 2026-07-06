import { expect, test, type Page } from '@playwright/test'

/**
 * Inline editing of MIXED-content elements: a <p> that interleaves raw text with
 * child elements (the example's "Double-tap <kbd>Space</kbd> …" paragraph) is
 * edited as its raw innerHTML — double-click shows the markup as editable text,
 * and committing re-parses it back into DOM (child elements preserved).
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
// The mixed paragraph — raw text + several <span class="kbd"> + <strong> runs.
// Located structurally (`.hero p`) so it stays matched even after its text is
// edited away.
const mixedP = (page: Page) => page.locator('.hero p')

test('double-click edits a mixed <p> as innerHTML and preserves child markup', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  const p = mixedP(page)
  await expect(p.locator('span.kbd').first()).toBeVisible() // starts as real DOM

  // Cmd+click the leading plain-text run (not a <span>) to select the <p> itself.
  await p.click({ modifiers: ['Meta'], position: { x: 6, y: 8 } })
  await page.waitForTimeout(450) // clear the double-tap window vs the select click

  // Double-click → inline edit. The <p> now shows its raw innerHTML as text
  // (the child spans are momentarily gone — replaced by the markup string).
  await p.dblclick({ position: { x: 6, y: 8 } })
  await expect.poll(() => p.locator('span.kbd').count()).toBe(0)

  // Replace the markup with new HTML, then commit with Enter.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Hit <span class="kbd">Enter</span> to save')
  await page.keyboard.press('Enter')

  // Committed as innerHTML → the new <span class="kbd"> is real DOM again.
  await expect(p.locator('span.kbd')).toHaveText('Enter')
  await expect(p).toContainText('Hit')
  await expect(p).toContainText('to save')

  // Undo restores the original mixed content (multiple kbd runs return).
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => p.locator('span.kbd').count()).toBeGreaterThan(1)
  await expect(p).toContainText('Double-tap')
})
