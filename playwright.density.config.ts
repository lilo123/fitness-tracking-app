import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'visual-density.test.ts',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
