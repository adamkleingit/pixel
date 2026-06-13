import { defineConfig, devices } from '@playwright/test'
import {
  EXAMPLE_PORT,
  EXAMPLE_URL,
  SCREENSHARE_DIR,
  SERVER_PORT,
  SERVER_URL,
  TRANSCRIPT_FIXTURE,
} from './e2e/fixtures'

export default defineConfig({
  testDir: './e2e',
  // The recording pipeline is stateful (shared dropbox), so run serially.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
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
        SCREENSHARE_DIR,
        SCREENSHARE_PORT: String(SERVER_PORT),
        SCREENSHARE_TRANSCRIBE_MOCK: TRANSCRIPT_FIXTURE,
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
        VITE_SCREENSHARE_SERVER_URL: SERVER_URL,
      },
    },
  ],
})
