import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // run tests sequentially so the shared dev server isn't overwhelmed
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',       // record a full trace for every test
    video: 'on',       // record a video for every test
    screenshot: 'on',  // capture a screenshot at the end of every test
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
