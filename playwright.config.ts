import { defineConfig, devices } from '@playwright/test'
import {
  EXAMPLE_DIR,
  EXAMPLE_PORT,
  EXAMPLE_URL,
  PIXEL_DIR,
  SERVER_PORT,
  SERVER_URL,
  TRANSCRIPT_FIXTURE,
} from './e2e/fixtures'

export default defineConfig({
  testDir: './e2e',
  // The packaging smoke suite lives under e2e/pack/ but needs its OWN servers
  // (the installed tarballs) — it runs via playwright.pack.config.ts, not here.
  // Exclude it so this workspace-linked run doesn't pick it up recursively.
  testIgnore: '**/pack/**',
  // The recording pipeline is stateful (shared dropbox), so run serially.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // Drag/resize/reorder tests drive synthetic pointer input against a live React
  // app; headless pointer timing varies under load, so a gesture can occasionally
  // land a frame early. The interactions are deterministic when they register —
  // a retry absorbs the rare input-timing miss (and marks it flaky) rather than
  // failing the suite. CI is stricter (2) than local (1).
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
  use: {
    baseURL: EXAMPLE_URL,
    // Grant the mic up front; the fake-ui flag also auto-accepts the prompt.
    permissions: ['microphone'],
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        // Feed MediaRecorder a synthetic mic so getUserMedia resolves headless.
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Run the ingest server straight from TS via tsx — no build needed. The
      // mock-transcriber env keeps Whisper/ffmpeg out of the test entirely.
      command: 'npx tsx packages/server/src/index.ts',
      url: `${SERVER_URL}/health`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PIXEL_DIR,
        PIXEL_PORT: String(SERVER_PORT),
        PIXEL_TRANSCRIBE_MOCK: TRANSCRIPT_FIXTURE,
        // Extract design tokens from the example app's globals.css (not the
        // .artifacts dropbox parent), so GET /tokens serves a real token set.
        PIXEL_PROJECT_DIR: EXAMPLE_DIR,
      },
    },
    {
      // Build the SDK (the example consumes its dist), then serve the example,
      // pointed at the test server's port.
      command: `npm run build -w @getpixel/ui && npm run dev -w @getpixel/example -- --port ${EXAMPLE_PORT} --strictPort`,
      url: EXAMPLE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_PIXEL_SERVER_URL: SERVER_URL,
      },
    },
  ],
})
