import { expect, test, type Page, type Locator } from '@playwright/test'
import { settleLayout } from './fixtures'

const bar = (page: Page) => page.locator('.pixel-rec')
const editBtn = (page: Page) => bar(page).getByRole('button', { name: 'Edit' })
const pane = (page: Page) => page.locator('[aria-label="Design pane"]')
const upgrade = (page: Page) => page.getByRole('button', { name: 'Upgrade' })

async function enterEdit(page: Page): Promise<void> {
  await page.goto('/')
  await editBtn(page).click()
  await expect(pane(page)).toBeVisible()
}

async function selectExact(loc: Locator): Promise<void> {
  await loc.click({ modifiers: ['Meta'] })
}

async function shrinkUpgrade(page: Page): Promise<void> {
  await upgrade(page).evaluate((el) => {
    const h = el as HTMLElement
    h.style.width = '40px'
    h.style.height = '40px'
    h.style.padding = '0'
    h.style.fontSize = '0'
    h.style.overflow = 'hidden'
    h.style.borderRadius = '0px'
  })
  await settleLayout(page)
}

async function dragFrom(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(x - 1, y - 1)
  await page.mouse.move(x, y)
  await page.waitForTimeout(100)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}

test('closest handle: outer corner resizes; inset point adjusts radius', async ({ page }) => {
  await enterEdit(page)
  await selectExact(upgrade(page))
  await shrinkUpgrade(page)
  await upgrade(page).hover()
  await page.waitForTimeout(350)

  const corner = page.locator('[data-resize-handle="corner"][data-corner="br"]')
  await expect(corner).toBeVisible()
  const cb = (await corner.boundingBox())!
  const before = (await upgrade(page).boundingBox())!

  await dragFrom(page, cb.x + cb.width / 2, cb.y + cb.height / 2, 40, 30)
  await settleLayout(page)

  const afterResize = (await upgrade(page).boundingBox())!
  expect(afterResize.width).toBeGreaterThan(before.width + 20)
  expect(afterResize.height).toBeGreaterThan(before.height + 15)

  await shrinkUpgrade(page)
  await upgrade(page).hover()
  await page.waitForTimeout(350)

  const radiusHandle = page.locator('[data-resize-handle="radius"][data-corner="br"]')
  await expect(radiusHandle).toBeVisible()
  const rb = (await radiusHandle.boundingBox())!
  const beforeRadius = await upgrade(page).evaluate(
    (el) => (el as HTMLElement).style.borderBottomRightRadius,
  )

  await dragFrom(page, rb.x + rb.width / 2, rb.y + rb.height / 2, -14, -14)
  await settleLayout(page)

  await expect
    .poll(() => upgrade(page).evaluate((el) => (el as HTMLElement).style.borderBottomRightRadius))
    .not.toBe(beforeRadius)

  const afterRadius = (await upgrade(page).boundingBox())!
  const box2 = before // size after shrink; re-read
  const shrunk = (await upgrade(page).boundingBox())!
  // Size should stay near the shrunk box (radius drag, not resize)
  expect(Math.abs(afterRadius.width - shrunk.width)).toBeLessThan(8)
  expect(Math.abs(afterRadius.height - shrunk.height)).toBeLessThan(8)
})
