import { defineConfig, devices } from '@playwright/test';
import { assertSafeTestEnv, LOCAL_TEST_PORT } from './e2e/safe-env';

// Browser tests create real data. Outside CI they run only against staging, on their own server (docs/STAGING_SETUP.md).
const local = !process.env.CI;
if (local) assertSafeTestEnv();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  timeout: 30_000,
  use: {
    baseURL: local ? `http://localhost:${LOCAL_TEST_PORT}` : process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: 'npm run start',
        port: 3000,
        reuseExistingServer: false,
      }
    : {
        // Never reuses the dev server on :3000, which runs on the production database.
        command: `npx --yes dotenv-cli -e ../../.env.staging -- npx next dev -p ${LOCAL_TEST_PORT}`,
        port: LOCAL_TEST_PORT,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
