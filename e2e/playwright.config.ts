import { defineConfig, devices } from '@playwright/test';
import { getChildProcessEnv, loadE2EEnv } from './helpers/env';

const e2eEnv = loadE2EEnv();

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e/test-report', open: 'never' }]],
  use: {
    baseURL: e2eEnv.E2E_WEB_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start-web.mjs',
    url: e2eEnv.E2E_WEB_BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: getChildProcessEnv(e2eEnv),
  },
  projects: [
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      testMatch: /mobile\/.*\.spec\.ts/,
      timeout: 600_000,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'cross-app',
      testMatch: /cross-app\/.*\.spec\.ts/,
      timeout: 600_000,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
