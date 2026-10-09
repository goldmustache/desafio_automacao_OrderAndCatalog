import 'dotenv/config';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 15_000,
  expect: {
    timeout: 5_000,
  },
  projects: [
    {
      name: 'api',
      testMatch: '**/api-matrix.spec.ts',
      use: {
        baseURL: process.env.API_BASE_URL ?? 'http://localhost:8080',
        extraHTTPHeaders: {
          Accept: 'application/json',
        },
      },
    },
    {
      name: 'ui',
      testMatch: '**/ui/**/*.spec.ts',
      use: {
        baseURL: process.env.APP_BASE_URL ?? 'http://localhost:4200',
        browserName: 'chromium',
        headless: Boolean(process.env.CI),
      },
    },
  ],
});
