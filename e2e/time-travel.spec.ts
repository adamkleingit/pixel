import { expect, test } from '@playwright/test'

// Scope to the pixel bar — the example app has its own buttons too.
type PWPage = import('@playwright/test').Page
const bar = (page: PWPage) => page.locator('.pixel-rec')
const statesBtn = (page: PWPage) => bar(page).getByRole('button', { name: 'State history' })
const statesPane = (page: PWPage) => page.locator('.pixel-pane[aria-label="State history pane"]')
const stateRows = (page: PWPage) => statesPane(page).locator('.pixel-states-row')
const frozenBanner = (page: PWPage) => statesPane(page).locator('.pixel-states-frozen')

/**
 * pixel-react time-travel: the app routes its `react` through pixel-react (dev
 * alias), so its state is captured into the history pane. Freezing rewinds the
 * live DOM to a captured commit; resuming restores the pre-freeze state.
 */
test('opens the state-history pane and captures app state', async ({ page }) => {
  await page.goto('/')
  const btn = statesBtn(page)
  await expect(btn).toHaveAttribute('aria-pressed', 'false')

  await btn.click()
  await expect(statesPane(page)).toBeVisible()
  // Mount + the server-health fetch resolving produce at least one captured frame.
  await expect(async () => {
    expect(await stateRows(page).count()).toBeGreaterThan(0)
  }).toPass()
})

test('freezing rewinds the DOM to a captured state; resume restores it', async ({ page }) => {
  await page.goto('/')

  // Open the app dialog — an app state change that gets captured as a new frame.
  await page.getByRole('button', { name: 'Open dialog' }).click()
  await expect(page.getByText('Test dialog')).toBeVisible()

  await statesBtn(page).click()
  await expect(statesPane(page)).toBeVisible()
  // Need at least two states: one before the dialog (oldest), one after.
  await expect(async () => {
    expect(await stateRows(page).count()).toBeGreaterThan(1)
  }).toPass()

  // Freeze to the OLDEST captured state (state 1) — before the dialog was
  // opened. The app remounts through pixel-react in suppress mode.
  await statesPane(page).getByTitle('Freeze to state 1').click()
  await expect(frozenBanner(page)).toBeVisible()
  await expect(frozenBanner(page)).toContainText('Frozen at state 1')
  // The frozen (historical) DOM has no dialog.
  await expect(page.getByText('Test dialog')).toHaveCount(0)

  // Resume live → the pre-freeze state is restored (dialog visible again).
  await statesPane(page).getByRole('button', { name: 'Resume live' }).click()
  await expect(frozenBanner(page)).toHaveCount(0)
  await expect(page.getByText('Test dialog')).toBeVisible()
})

test('Edit while time-traveling: hides states pane, edits the frozen version, resumes on exit', async ({ page }) => {
  const editBtn = bar(page).getByRole('button', { name: 'Edit' })
  const cancelBtn = bar(page).getByRole('button', { name: 'Cancel' })
  const designPane = page.locator('.pixel-pane[aria-label="Design pane"]')

  await page.goto('/')
  await page.getByRole('button', { name: 'Open dialog' }).click()
  await expect(page.getByText('Test dialog')).toBeVisible()

  await statesBtn(page).click()
  await expect(async () => {
    expect(await stateRows(page).count()).toBeGreaterThan(1)
  }).toPass()

  // Freeze to the oldest state (before the dialog) and confirm we're frozen.
  await statesPane(page).getByTitle('Freeze to state 1').click()
  await expect(frozenBanner(page)).toBeVisible()
  await expect(page.getByText('Test dialog')).toHaveCount(0)

  // Enter edit → states pane disappears, design pane appears, still frozen.
  await editBtn.click()
  await expect(statesPane(page)).toHaveCount(0)
  await expect(designPane).toBeVisible()
  await expect(page.getByText('Test dialog')).toHaveCount(0) // still the frozen version

  // Finish editing (Cancel) → resume live: pane returns, no longer frozen, and
  // the pre-freeze state is restored (dialog visible again).
  await cancelBtn.click()
  await expect(designPane).toHaveCount(0)
  await expect(statesPane(page)).toBeVisible()
  await expect(frozenBanner(page)).toHaveCount(0)
  await expect(page.getByText('Test dialog')).toBeVisible()
})

test('typing in the dialog is captured; time-travel rewinds the typed text', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open dialog' }).click()
  const input = page.locator('.dialog-panel input[type="text"]')
  await expect(input).toBeVisible()

  // Type character-by-character with small pauses so each keystroke settles into
  // its own captured frame (capture coalesces per animation frame).
  await input.fill('')
  for (const ch of 'ABCDE') {
    await input.pressSequentially(ch)
    await page.waitForTimeout(120)
  }
  await expect(input).toHaveValue('ABCDE')

  await statesBtn(page).click()
  await expect(statesPane(page)).toBeVisible()
  // Several frames: dialog open + one per keystroke.
  await expect(async () => {
    expect(await stateRows(page).count()).toBeGreaterThan(3)
  }).toPass()

  // Step back through the typing history; the input reverts to shorter strings.
  const back = statesPane(page).getByRole('button', { name: 'Previous state' })
  await back.click() // newest — 'ABCDE'
  await expect(frozenBanner(page)).toBeVisible()
  await back.click() // 'ABCD'
  await back.click() // 'ABC'
  await expect(input).toHaveValue('ABC')

  // Resume live → the full typed text is restored.
  await statesPane(page).getByRole('button', { name: 'Resume live' }).click()
  await expect(frozenBanner(page)).toHaveCount(0)
  await expect(page.locator('.dialog-panel input[type="text"]')).toHaveValue('ABCDE')
})

test('chevrons step between captured states', async ({ page }) => {
  await page.goto('/')
  // Generate a couple of extra state changes (open + close the dialog).
  await page.getByRole('button', { name: 'Open dialog' }).click()
  await expect(page.getByText('Test dialog')).toBeVisible()
  await page.getByRole('button', { name: 'OK' }).click()

  await statesBtn(page).click()
  await expect(async () => {
    expect(await stateRows(page).count()).toBeGreaterThan(1)
  }).toPass()

  // Back from live freezes to the newest state; another back steps earlier.
  const back = statesPane(page).getByRole('button', { name: 'Previous state' })
  await back.click()
  await expect(frozenBanner(page)).toBeVisible()
  const firstText = await frozenBanner(page).textContent()
  await back.click()
  await expect(frozenBanner(page)).not.toHaveText(firstText ?? '')

  // Forward steps back toward the newest.
  await statesPane(page).getByRole('button', { name: 'Next state' }).click()
  await expect(frozenBanner(page)).toContainText('Frozen at state')
})
