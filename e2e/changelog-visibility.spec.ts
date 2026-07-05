import { expect, test, type Page } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { PIXEL_DIR } from './fixtures'

/**
 * The changelog (server task list) indicator is hidden while editing/recording.
 * Edit mode surfaces only the in-session change history (undo/redo) clock.
 */

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const changelog = (page: Page) => bar(page).getByRole('button', { name: 'Task log' })
const changeHistory = (page: Page) => bar(page).getByRole('button', { name: 'Change history' })

test.beforeEach(async () => {
  await rm(PIXEL_DIR, { recursive: true, force: true })
})

test('changelog hides in edit mode; only change history (undo/redo) shows', async ({ page }) => {
  await page.goto('/')

  // Make an edit and Save so the server has a task — that's what earns the
  // changelog indicator a slot while idle.
  await editBtn(page).click()
  const p = page.locator('.card', { hasText: 'Inbox' }).locator('p')
  await p.click({ modifiers: ['Meta'] })
  const ta = page.locator('[aria-label="Design pane"]').getByRole('textbox', { name: 'Text content' })
  await ta.fill('Changed copy')
  await ta.blur()
  await bar(page).getByRole('button', { name: 'Save' }).click()

  // Idle again → the changelog indicator appears once the task list polls in.
  await expect(changelog(page)).toBeVisible()
  await expect(changeHistory(page)).toHaveCount(0) // no in-session history while idle

  // Re-enter edit mode → the changelog hides; the change-history clock shows.
  await editBtn(page).click()
  await expect(changelog(page)).toHaveCount(0)
  await expect(changeHistory(page)).toBeVisible()
})
