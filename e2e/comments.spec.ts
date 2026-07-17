import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { INBOX_DIR, PIXEL_DIR } from './fixtures'

async function waitForCommentTask(timeoutMs = 30_000): Promise<string> {
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
      if (existsSync(join(dir, 'comments.json')) && existsSync(join(dir, 'timeline.json'))) {
        return id
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no comment task appeared in ${INBOX_DIR} within ${timeoutMs}ms`)
}

type PWPage = import('@playwright/test').Page
const commentBtn = (page: PWPage) =>
  page.locator('.pixel-rec').getByRole('button', { name: 'Comment' })
const editBtn = (page: PWPage) => page.locator('.pixel-rec').getByRole('button', { name: 'Edit' })
const saveBtn = (page: PWPage) => page.locator('.pixel-rec').getByRole('button', { name: 'Save' })
const cancelBtn = (page: PWPage) =>
  page.locator('.pixel-rec').getByRole('button', { name: 'Cancel' })
const commentingBar = (page: PWPage) => page.locator('.pixel-rec.commenting')

test.beforeEach(async ({ page }) => {
  await rm(PIXEL_DIR, { recursive: true, force: true })
  // Skip onboarding so tour layers don't intercept clicks.
  await page.addInitScript(() => {
    localStorage.setItem(
      'pixel:onboarding:v1',
      JSON.stringify({
        welcome: true,
        recording: true,
        postRecording: true,
        editing: true,
        commenting: true,
      }),
    )
  })
})

test('comment icon sits below edit; no sep between Rec and Edit', async ({ page }) => {
  await page.goto('/')
  const bar = page.locator('.pixel-rec')
  await expect(commentBtn(page)).toBeVisible()
  await expect(editBtn(page)).toBeVisible()

  // Rec and Edit are adjacent siblings — no .pixel-rec-sep between them.
  const between = await bar.evaluate((el) => {
    const rec = el.querySelector('[data-pixel-tour="record"]')
    const edit = el.querySelector('[data-pixel-tour="edit"]')
    if (!rec || !edit) return 'missing'
    let n = rec.nextElementSibling
    while (n && n !== edit) {
      if (n.classList.contains('pixel-rec-sep')) return 'sep'
      n = n.nextElementSibling
    }
    return n === edit ? 'adjacent' : 'not-found'
  })
  expect(between).toBe('adjacent')

  // Comment is after Edit in the bar.
  const order = await bar.evaluate((el) => {
    const edit = el.querySelector('[data-pixel-tour="edit"]')
    const comment = el.querySelector('[data-pixel-tour="comment"]')
    if (!edit || !comment) return false
    return !!(edit.compareDocumentPosition(comment) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(order).toBe(true)
})

test('comment mode is mutually exclusive with edit and recording', async ({ page }) => {
  await page.goto('/')
  await commentBtn(page).click()
  await expect(commentingBar(page)).toBeVisible()
  await expect(editBtn(page)).toHaveCount(0)
  await expect(page.locator('.pixel-rec [data-pixel-tour="record"]')).toHaveCount(0)

  // Cancel with no pins exits immediately (no confirm).
  await cancelBtn(page).click()
  await expect(commentBtn(page)).toBeVisible()

  await editBtn(page).click()
  await expect(page.locator('.pixel-rec.editing')).toBeVisible()
  await expect(commentBtn(page)).toHaveCount(0)
  await expect(page.locator('.pixel-rec [data-pixel-tour="record"]')).toHaveCount(0)
  await cancelBtn(page).click()
})

test('place a comment, Save → comments.json with target; changelog shows comment icon', async ({
  page,
}) => {
  await page.goto('/')
  await commentBtn(page).click()
  await expect(commentingBar(page)).toBeVisible()

  // Click a real app element (the Upgrade button on the Billing card).
  const upgrade = page.getByRole('button', { name: 'Upgrade' })
  await expect(upgrade).toBeVisible()
  const box = await upgrade.boundingBox()
  if (!box) throw new Error('no Upgrade box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  const input = page.locator('.pixel-comment-input')
  await expect(input).toBeVisible()
  await input.fill('Make this button wider')
  await page.getByRole('button', { name: 'Close' }).click()

  // Second pin in the same session — both must land in ONE task on Save.
  const invite = page.getByRole('button', { name: 'Invite' })
  const box2 = await invite.boundingBox()
  if (!box2) throw new Error('no Invite box')
  await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2)
  await expect(page.locator('.pixel-comment-input')).toBeVisible()
  await page.locator('.pixel-comment-input').fill('Invite copy is unclear')
  await page.getByRole('button', { name: 'Close' }).click()

  await expect(page.locator('.pixel-rec [data-pixel-tour="save"]')).toHaveAttribute(
    'aria-label',
    'Save 2 comments',
  )
  await saveBtn(page).click()
  const id = await waitForCommentTask()
  const payload = JSON.parse(await readFile(join(INBOX_DIR, id, 'comments.json'), 'utf8')) as {
    comments: Array<{ body: string; target: Array<{ tag: string; text?: string }> }>
  }
  expect(payload.comments).toHaveLength(2)
  expect(payload.comments.map((c) => c.body).sort()).toEqual([
    'Invite copy is unclear',
    'Make this button wider',
  ])
  expect(payload.comments[0].target.some((t) => t.tag === 'button')).toBe(true)

  // One changelog row for the whole batch, labeled with the count.
  await expect(commentBtn(page)).toBeVisible()
  const taskLog = page.locator('.pixel-rec').getByRole('button', { name: 'Task log' })
  await expect(taskLog).toBeVisible({ timeout: 15_000 })
  await taskLog.click()
  await expect(page.locator('.pixel-tasks-kind.comment')).toBeVisible()
  await expect(page.locator('.pixel-tasks-id')).toContainText('2 comments')
})

test('Cancel with pins shows confirm; Discard exits without saving', async ({ page }) => {
  await page.goto('/')
  await commentBtn(page).click()
  const upgrade = page.getByRole('button', { name: 'Upgrade' })
  const box = await upgrade.boundingBox()
  if (!box) throw new Error('no Upgrade box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('.pixel-comment-input')).toBeVisible()
  await page.locator('.pixel-comment-input').fill('temp note')

  await cancelBtn(page).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Keep' }).click()
  await expect(commentingBar(page)).toBeVisible()

  await cancelBtn(page).click()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(commentingBar(page)).toHaveCount(0)

  // Nothing saved.
  await page.waitForTimeout(500)
  let ids: string[] = []
  try {
    ids = await readdir(INBOX_DIR)
  } catch {
    ids = []
  }
  expect(ids.length).toBe(0)
})
