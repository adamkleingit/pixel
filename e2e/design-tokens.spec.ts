import { expect, test } from '@playwright/test'
import { SERVER_URL } from './fixtures'

/**
 * Design-tokens acceptance: the server extracts the example app's `globals.css`
 * and serves it at GET /tokens (the "watcher creates the design-tokens file"
 * half), and the in-app design pane's token pickers are populated from it (the
 * "tokens are visible in the design pane" half). On-canvas drag-snap to those
 * token values + the modifier model is pinned by the unit tests
 * (drag/token-snap.test.ts) and the context→registry wiring
 * (drag/spacing-snap-wiring.test.tsx).
 */

// Scope to the screenshare bar — the example app has its own "Edit" button.
type PWPage = import('@playwright/test').Page
const editBtn = (page: PWPage) =>
  page.locator('.screenshare-rec').getByRole('button', { name: 'Edit' })

test('the server extracts the project tokens and serves them at GET /tokens', async ({ request }) => {
  // Extraction runs asynchronously after the server boots; poll until ready.
  await expect
    .poll(
      async () => {
        const res = await request.get(`${SERVER_URL}/tokens`)
        if (!res.ok()) return 0
        const cache = (await res.json()) as { tokens?: { name: string }[] }
        return cache.tokens?.length ?? 0
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0)

  const cache = (await (await request.get(`${SERVER_URL}/tokens`)).json()) as {
    adapterId: string
    tokens: { name: string; kind: string; value: string; usage: { kind: string; className?: string } }[]
  }
  expect(cache.adapterId).toBe('shadcn')
  const byName = Object.fromEntries(cache.tokens.map((t) => [t.name, t]))

  // A built-in color token spelled as a Tailwind utility.
  expect(byName.primary?.kind).toBe('color')
  expect(byName.primary?.usage).toEqual({ kind: 'utility', className: 'bg-primary' })
  // A spacing token with a known px value (drives drag-snap).
  expect(cache.tokens.some((t) => t.kind === 'spacing' && t.value === '16px')).toBe(true)
})

test('the design pane token pickers are populated from the project tokens', async ({ page }) => {
  await page.goto('/')
  await editBtn(page).click()

  // Select a card (a div → Appearance/Fill sections with color + radius pickers).
  await page.locator('.card', { hasText: 'Billing' }).click({ modifiers: ['Meta'] })
  await expect(page.locator('.screenshare-pane-tag')).toBeVisible()

  // A "Use a token" button only renders when tokens of that kind exist — its
  // presence is itself proof the pane sees the project tokens. (For a div the
  // first such picker is spacing/radius; color lives in Fill/Text — all are fed
  // by the same fetched set.)
  const useToken = page.locator('.screenshare-pane').getByRole('button', { name: /token/i }).first()
  await expect(useToken).toBeVisible()
  await useToken.click()

  // The populated picker popover opens (its search box) and lists token rows —
  // each row button carries a `title="<name> — <value>"`, kind-agnostic proof.
  await expect(page.getByPlaceholder('Search tokens')).toBeVisible()
  await expect(page.locator('button[title*="—"]').first()).toBeVisible()
})
