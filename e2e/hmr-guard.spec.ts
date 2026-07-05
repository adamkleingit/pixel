import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Verifies the HMR guard end-to-end against the real Vite dev server: while a
 * Pixel session is active, a source change that would normally reload the page
 * is deferred, and the deferred reload fires the moment the session ends.
 *
 * We touch `main.tsx` (the entry has no `import.meta.hot.accept`, so Vite escalates
 * to a *full reload* — observable because a reload wipes a window marker; a
 * component HMR update would preserve it and wouldn't prove anything).
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = join(HERE, '..', 'examples', 'basic', 'src', 'main.tsx')

const editBtn = (page: Page) =>
  page.locator('.pixel-rec').getByRole('button', { name: 'Edit' })
const cancelBtn = (page: Page) =>
  page.locator('.pixel-rec').getByRole('button', { name: 'Cancel' })

const marker = (page: Page) => page.evaluate(() => (window as unknown as { __pixel?: string }).__pixel)

test('defers a full reload during an edit session, then applies it on exit', async ({ page }) => {
  const original = await readFile(ENTRY, 'utf8')
  try {
    await page.goto('/')
    await page.evaluate(() => {
      ;(window as unknown as { __pixel?: string }).__pixel = 'alive'
    })

    // Enter edit mode → session active → HMR should be held back.
    await editBtn(page).click()
    await expect(page.locator('[aria-label="Design pane"]')).toBeVisible()

    // Touch the entry to trigger a full reload. The guard must abort it.
    await writeFile(ENTRY, `${original}\n// pixel-hmr-test ${Date.now()}\n`)
    await page.waitForTimeout(2000) // give Vite time to (try to) reload

    // The page did NOT reload — the marker survives and we're still editing.
    expect(await marker(page)).toBe('alive')
    await expect(page.locator('[aria-label="Design pane"]')).toBeVisible()

    // Exit the session → the deferred reload fires now.
    await cancelBtn(page).click()
    await expect.poll(() => marker(page), { timeout: 15_000 }).toBeUndefined()
  } finally {
    await writeFile(ENTRY, original)
    await page.waitForTimeout(500)
  }
})
