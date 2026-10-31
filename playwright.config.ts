import { defineConfig } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import chromium from '@sparticuz/chromium';
export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath: join(tmpdir(), 'chromium'),
      args: chromium.args.filter(
        (arg) =>
          ![
            '--single-process',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--disable-site-isolation-trials',
          ].includes(arg),
      ),
    },
  },
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      url: 'http://localhost:4000/v1/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run start -w @assessment/web',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001 } },
});
