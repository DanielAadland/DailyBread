import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the exported web build in demo mode (no server needed).
// Build first: `pnpm build:web` (without EXPO_PUBLIC_SUPABASE_* set).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:8090',
    // CHROMIUM_PATH lets environments without Playwright's browser download use their own Chromium.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 820 }, browserName: 'chromium' } },
  ],
  webServer: { command: 'node scripts/serve-dist.mjs', url: 'http://localhost:8090', reuseExistingServer: true },
});
