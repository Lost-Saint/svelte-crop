import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    command: 'bun run build && bun run preview',
    port: 4173,
  },
  testMatch: '**/*.e2e.{ts,js}',
})
