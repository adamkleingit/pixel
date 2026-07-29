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
    h.style.width = '28px'
    h.style.height = '28px'
    h.style.padding = '0'
    h.style.fontSize = '0'
    h.style.overflow = 'hidden'
    h.style.borderRadius = '0px'
  })
  await settleLayout(page)
}

async function dragFrom(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(x, y)
  await page.waitForTimeout(50)
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

  const box = (await upgrade(page).boundingBox())!
  const beforeW = box.width
  const beforeH = box.height
  await dragFrom(page, box.x + box.width, box.y + box.height, 40, 30)
  await settleLayout(page)
  const afterResize = (await upgrade(page).boundingBox())!
  expect(afterResize.width).toBeGreaterThan(beforeW + 20)
  expect(afterResize.height).toBeGreaterThan(beforeH + 15)

  await shrinkUpgrade(page)
  await upgrade(page).hover()
  await page.waitForTimeout(350)

  const box2 = (await upgrade(page).boundingBox())!
  const beforeRadius = await upgrade(page).evaluate(
    (el) => getComputedStyle(el as HTMLElement).borderBottomRightRadius,
  )
  await dragFrom(page, box2.x + box2.width - 8, box2.y + box2.height - 8, -14, -14)
  await settleLayout(page)
  await expect
    .poll(() =>
      upgrade(page).evaluate(
        (el) => getComputedStyle(el as HTMLElement).borderBottomRightRadius,
      ),
    )
    .not.toBe(beforeRadius)
  const afterRadius = (await upgrade(page).boundingBox())!
  expect(Math.abs(afterRadius.width - box2.width)).toBeLessThan(6)
  expect(Math.abs(afterRadius.height - box2.height)).toBeLessThan(6)
})
