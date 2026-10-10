import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: '**/*.e2e.{ts,js}',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Explicit chromium project, matching CI. Add firefox/webkit projects once
  // the exact transform-matrix expectations below are reviewed for
  // cross-engine serialization differences.
  projects: [{ name: 'chromium' }],
  use: {
    baseURL: 'http://localhost:4173',
    // Pinned: every expectation in cropper.e2e.ts was derived from this
    // fixture (1280x720 viewport, dog.jpeg 1910x1000). Never rely on defaults.
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run build && bun run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
