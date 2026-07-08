import { existsSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { INBOX_DIR, PIXEL_DIR, SERVER_URL } from './fixtures'

// Smoke test for the PACKAGED build: @getpixel/ui + @getpixel/server installed as
// published tarballs into a clean, un-workspaced app (see scripts/pack-smoke-setup.mjs).
// A few basic assertions that the real install works: the server connects and an
// edit round-trips through the installed SDK → installed server → dropbox.

/** Poll the dropbox until an edit task (edits.json + ready timeline.json) lands. */
async function waitForEditTask(timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let ids: string[] = []
    try {
      ids = await readdir(INBOX_DIR)
    } catch {
      /* inbox not created yet */
    }
    for (const id of ids) {
      const dir = join(INBOX_DIR, id)
      if (existsSync(join(dir, 'edits.json')) && existsSync(join(dir, 'timeline.json'))) return id
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no edit task appeared in ${INBOX_DIR} within ${timeoutMs}ms`)
}

const editBtn = (page: Page) => page.locator('.pixel-rec').getByRole('button', { name: 'Edit' })
const saveBtn = (page: Page) => page.locator('.pixel-rec').getByRole('button', { name: 'Save' })

test.beforeEach(async () => {
  // The edit test writes into the dropbox — start each run from a clean one.
  await rm(PIXEL_DIR, { recursive: true, force: true })
})

test('the installed server is connected', async ({ page, request }) => {
  // 1. The installed server bundle answers /health directly.
  const health = await request.get(`${SERVER_URL}/health`)
  expect(health.ok()).toBe(true)
  expect((await health.json()).ok).toBe(true)

  // 2. The installed SDK, mounted in the app, reports the connection in the UI —
  //    proving httpSink(SERVER_URL) from the published package reaches the server.
  await page.goto('/')
  const status = page.getByTestId('server-status')
  await expect(status).toHaveAttribute('data-connected', 'true', { timeout: 15_000 })
  await expect(status).toContainText('connected')
})

test('an edit round-trips from the installed SDK to the installed server', async ({ page }) => {
  await page.goto('/')

  // The Pixel floating bar (from the installed @getpixel/ui) mounts its Edit pencil.
  await editBtn(page).click()

  // Select the card copy and edit it through the design pane's Content field.
  const copy = page.getByTestId('card-copy')
  await copy.click({ modifiers: ['Meta'] })
  const textarea = page.getByRole('textbox', { name: 'Text content' })
  await expect(textarea).toBeVisible()
  await textarea.fill('Upgraded copy')
  await textarea.blur() // commits through the change tracker
  await expect(copy).toHaveText('Upgraded copy')

  // Save → the installed SDK POSTs the batch to the installed server's /edits,
  // which writes it into the dropbox for an agent to pick up.
  await saveBtn(page).click()

  const id = await waitForEditTask()
  const edits = JSON.parse(await readFile(join(INBOX_DIR, id, 'edits.json'), 'utf8'))
  expect(Array.isArray(edits.changes)).toBe(true)
  const textChange = edits.changes.find((c: { kind: string }) => c.kind === 'text')
  expect(textChange?.after).toBe('Upgraded copy')
})
