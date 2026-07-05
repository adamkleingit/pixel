import { existsSync } from 'node:fs'
import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { INBOX_DIR, PIXEL_DIR } from './fixtures'

/** Poll the dropbox until a recording dir has its `timeline.json` (written last). */
async function waitForReadyRecording(timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    let ids: string[] = []
    try {
      ids = await readdir(INBOX_DIR)
    } catch {
      /* inbox not created yet */
    }
    for (const id of ids) {
      if (existsSync(join(INBOX_DIR, id, 'timeline.json'))) return id
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no recording with timeline.json appeared in ${INBOX_DIR} within ${timeoutMs}ms`)
}

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

/** Start a recording, click a couple of targets, then double-tap Space to stop. */
async function recordSession(page: Page): Promise<void> {
  await page.goto('/')
  const status = page.locator('.status')
  await expect(status).toBeVisible()

  // Start via the controls-bar button (enabled only while idle).
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(status).toHaveClass(/recording/)

  // Let MediaRecorder accumulate at least one 1s audio chunk.
  await page.waitForTimeout(1500)

  // Click real targets — in block mode the app won't react, but the SDK records
  // these as click events with their element chains.
  await page.getByRole('button', { name: 'Upgrade' }).click()
  await page.getByRole('button', { name: 'Compose' }).click()
  await page.waitForTimeout(800)

  // Double-tap Space (within the 350ms window) → stop. Space is the one key the
  // block-mode swallower lets through.
  await page.keyboard.press('Space')
  await page.waitForTimeout(80)
  await page.keyboard.press('Space')

  // Back to idle once the 500ms tail + upload complete.
  await expect(status).not.toHaveClass(/recording/, { timeout: 15_000 })
}

test.beforeEach(async () => {
  // Start each test from a clean dropbox so we read exactly one recording.
  await rm(PIXEL_DIR, { recursive: true, force: true })
})

test('the M shortcut toggles the mouse tool while recording', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.locator('.status')).toHaveClass(/recording/)

  const tool = page.getByRole('button', { name: 'Mouse tool' })
  // Mouse tool is on by default (page inert, rectangles draw).
  await expect(tool).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('m')
  await expect(tool).toHaveAttribute('aria-pressed', 'false') // → passthrough / no tool

  await page.keyboard.press('m')
  await expect(tool).toHaveAttribute('aria-pressed', 'true')

  // Clicking a bar button moves focus into the overlay — the shortcut must still
  // work from there (a keyboard shortcut shouldn't depend on where focus is).
  await tool.click()
  await expect(tool).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('m')
  await expect(tool).toHaveAttribute('aria-pressed', 'true')

  // Discard — this test is about the toggle, not persistence.
  await page.keyboard.press('Escape')
  await expect(page.locator('.status')).not.toHaveClass(/recording/)
})

test('rectangles only record with the mouse tool on; clicks record either way', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.locator('.status')).toHaveClass(/recording/)
  await page.waitForTimeout(300)

  // Tool ON (default): a drag past the threshold records a rectangle.
  await page.mouse.move(200, 300)
  await page.mouse.down()
  await page.mouse.move(360, 430, { steps: 8 })
  await page.mouse.up()

  // Tool OFF (M): the same drag must NOT record a rectangle…
  await page.keyboard.press('m')
  await expect(page.getByRole('button', { name: 'Mouse tool' })).toHaveAttribute('aria-pressed', 'false')
  await page.mouse.move(200, 520)
  await page.mouse.down()
  await page.mouse.move(360, 600, { steps: 8 })
  await page.mouse.up()
  // …but a click still records (and passes through to the app).
  await page.getByRole('button', { name: 'Upgrade' }).click()

  await page.waitForTimeout(300)
  await page.keyboard.press('Space')
  await page.waitForTimeout(80)
  await page.keyboard.press('Space')
  await expect(page.locator('.status')).not.toHaveClass(/recording/, { timeout: 15_000 })

  const id = await waitForReadyRecording()
  const events = await readJson(join(INBOX_DIR, id, 'events.json'))
  const rects = events.filter((e: { kind: string }) => e.kind === 'rect')
  const clicks = events.filter((e: { kind: string }) => e.kind === 'click')
  expect(rects).toHaveLength(1) // only the tool-on drag
  expect(clicks.length).toBeGreaterThanOrEqual(1) // the passthrough click was recorded
})

test('Cmd+drag draws a freehand stroke (recorded with a snapshot) when the tool is on', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.locator('.status')).toHaveClass(/recording/)
  await page.waitForTimeout(300)

  // Cmd held + drag = freehand draw (not a rectangle).
  await page.keyboard.down('Meta')
  await page.mouse.move(200, 300)
  await page.mouse.down()
  await page.mouse.move(260, 340, { steps: 5 })
  await page.mouse.move(320, 300, { steps: 5 })
  await page.mouse.move(380, 360, { steps: 5 })
  await page.mouse.up()

  // The stroke stays on screen while Cmd is held, and clears when it's released.
  const strokes = page.locator('.pixel-stroke')
  await expect(strokes).toHaveCount(1)
  await page.keyboard.up('Meta')
  await expect(strokes).toHaveCount(0)

  await page.waitForTimeout(300)
  await page.keyboard.press('Space')
  await page.waitForTimeout(80)
  await page.keyboard.press('Space')
  await expect(page.locator('.status')).not.toHaveClass(/recording/, { timeout: 15_000 })

  const id = await waitForReadyRecording()
  const dir = join(INBOX_DIR, id)
  const events = await readJson(join(dir, 'events.json'))
  const draws = events.filter((e: { kind: string }) => e.kind === 'draw')
  const rects = events.filter((e: { kind: string }) => e.kind === 'rect')
  expect(draws).toHaveLength(1)
  expect(rects).toHaveLength(0) // Cmd+drag is a stroke, not a rectangle
  expect(draws[0].points.length).toBeGreaterThanOrEqual(2)

  // The stroke's region screenshot is persisted and referenced.
  expect(draws[0].snapshot).toBeTruthy()
  expect((await stat(join(dir, 'snaps', draws[0].snapshot))).size).toBeGreaterThan(0)

  // And it's surfaced in the correlated timeline as a draw item.
  const timeline = await readJson(join(dir, 'timeline.json'))
  const items = timeline.beats.flatMap((b: { items: { type: string }[] }) => b.items)
  expect(items.some((i: { type: string }) => i.type === 'draw')).toBe(true)
})

test('records a session and persists every artifact to the dropbox', async ({ page }) => {
  await recordSession(page)

  const id = await waitForReadyRecording()
  const dir = join(INBOX_DIR, id)

  // ---- meta.json -----------------------------------------------------------
  const meta = await readJson(join(dir, 'meta.json'))
  expect(meta.id).toBe(id)
  expect(meta.hasAudio).toBe(true)
  expect(typeof meta.startedAt).toBe('number')
  expect(typeof meta.durationMs).toBe('number')
  expect(meta.durationMs).toBeGreaterThan(0)
  expect(meta.eventCount).toBeGreaterThan(0)

  // ---- events.json ---------------------------------------------------------
  const events = await readJson(join(dir, 'events.json'))
  expect(Array.isArray(events)).toBe(true)
  expect(events.length).toBe(meta.eventCount)
  const clicks = events.filter((e: { kind: string }) => e.kind === 'click')
  expect(clicks.length).toBeGreaterThanOrEqual(2)
  // The clicked buttons should be captured in the element chains.
  const clickText = JSON.stringify(clicks)
  expect(clickText).toContain('Upgrade')
  expect(clickText).toContain('Compose')

  // A full-frame screenshot is captured on start; it must be referenced by a
  // `frame` event and persisted under snaps/.
  const frameEvents = events.filter((e: { kind: string }) => e.kind === 'frame')
  expect(frameEvents.length).toBeGreaterThanOrEqual(1)
  expect(frameEvents[0].reason).toBe('start')

  // ---- audio.webm ----------------------------------------------------------
  const audioStat = await stat(join(dir, 'audio.webm'))
  expect(audioStat.size).toBeGreaterThan(0)

  // ---- snaps/ --------------------------------------------------------------
  const snaps = await readdir(join(dir, 'snaps'))
  expect(snaps.length).toBe(meta.snapshotCount)
  // Each frame event's snapshot file must exist on disk.
  for (const fe of frameEvents) {
    expect(snaps).toContain(fe.snapshot)
    expect((await stat(join(dir, 'snaps', fe.snapshot))).size).toBeGreaterThan(0)
  }

  // ---- transcript.json (from the mock transcriber) -------------------------
  const transcript = await readJson(join(dir, 'transcript.json'))
  expect(transcript.model).toBe('mock')
  expect(transcript.text).toBe(
    'This is a mocked transcript. The billing card needs an upgrade button.',
  )
  expect(transcript.segments).toHaveLength(2)

  // ---- timeline.json (correlated events + transcript) ----------------------
  const timeline = await readJson(join(dir, 'timeline.json'))
  expect(timeline.hasTranscript).toBe(true)
  expect(timeline.durationMs).toBe(meta.durationMs)
  // Frame events are surfaced as frames[], not as beat items.
  expect(timeline.frames).toHaveLength(frameEvents.length)
  expect(timeline.frames[0]).toMatchObject({ reason: 'start', width: 1280, height: 720 })
  // Two transcript segments → two speech beats carrying their text.
  const speech = timeline.beats.filter((b: { kind: string }) => b.kind === 'speech')
  expect(speech.length).toBeGreaterThanOrEqual(2)
  const beatText = speech.map((b: { text?: string }) => b.text)
  expect(beatText).toContain('This is a mocked transcript.')
  expect(beatText).toContain('The billing card needs an upgrade button.')

  // Every click recorded should land in some beat across the timeline.
  const itemKinds = timeline.beats.flatMap((b: { items: { type: string }[] }) =>
    b.items.map((i) => i.type),
  )
  expect(itemKinds.filter((k: string) => k === 'click').length).toBeGreaterThanOrEqual(2)
})

test('surfaces an error when the upload fails, then resends successfully', async ({ page }) => {
  // Fail only the first POST /recordings (as if the server were down); let the
  // resend through so the recording is recovered, not lost.
  let attempts = 0
  await page.route('**/recordings', async (route) => {
    attempts++
    if (attempts === 1) await route.abort('failed')
    else await route.continue()
  })

  await recordSession(page)

  // The failed save surfaces a resend prompt that names the server, and nothing
  // has been persisted yet.
  const banner = page.locator('.pixel-save-error')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/pixel server/i)
  const resend = page.getByRole('button', { name: 'Resend' })
  await expect(resend).toBeVisible()
  expect(existsSync(INBOX_DIR)).toBe(false)
  expect(attempts).toBe(1)

  // Resend → the second POST goes through, the recording lands, banner clears.
  await resend.click()
  const id = await waitForReadyRecording()
  expect(attempts).toBe(2)
  await expect(banner).toBeHidden()

  // The recovered recording is complete (audio + events + timeline).
  const dir = join(INBOX_DIR, id)
  const meta = await readJson(join(dir, 'meta.json'))
  expect(meta.hasAudio).toBe(true)
  expect(meta.eventCount).toBeGreaterThan(0)
  expect((await stat(join(dir, 'audio.webm'))).size).toBeGreaterThan(0)
  const timeline = await readJson(join(dir, 'timeline.json'))
  expect(timeline.hasTranscript).toBe(true)
})
