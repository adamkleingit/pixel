import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { APP_DIR, APP_PORT, APP_URL, PIXEL_DIR, SERVER_PORT, SERVER_URL } from './e2e/pack/fixtures'

// PACKAGING SMOKE TEST — separate from the workspace-linked suite (playwright.config.ts).
//
// This config boots the packages exactly as a published consumer would run them:
//   • the server from its installed `dist` bundle (the `pixel-server` bin),
//   • the app consuming `@getpixel/ui` as an installed tarball via its `exports`.
// Both live in e2e/pack/.app, provisioned by scripts/pack-smoke-setup.mjs. If that
// hasn't run, fail loudly instead of booting servers against a missing dir.
if (!existsSync(join(APP_DIR, 'node_modules', '@getpixel', 'server', 'dist', 'index.js'))) {
  throw new Error(
    'Pack smoke app is not provisioned. Run `node scripts/pack-smoke-setup.mjs` first ' +
      '(or `npm run test:pack`, which chains it).',
  )
}

export default defineConfig({
  testDir: './e2e/pack',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // The INSTALLED server bundle — run its bin straight from the clean app's
      // node_modules, proving the published `dist` + `bin` actually boot.
      command: 'node node_modules/@getpixel/server/dist/index.js',
      cwd: APP_DIR,
      url: `${SERVER_URL}/health`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PIXEL_PORT: String(SERVER_PORT),
        PIXEL_DIR,
        // No audio in the smoke test — skip Whisper/ffmpeg entirely.
        PIXEL_TRANSCRIBE: '0',
        // Extract design tokens from the app's own globals.css.
        PIXEL_PROJECT_DIR: APP_DIR,
      },
    },
    {
      // The consumer app (Vite dev), consuming the installed @getpixel/ui.
      command: `npm run dev -- --port ${APP_PORT} --strictPort`,
      cwd: APP_DIR,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_PIXEL_SERVER_URL: SERVER_URL,
      },
    },
  ],
})
