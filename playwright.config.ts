import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.WHISPER_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
    testDir: './apps/web/tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'html',
    use: {
        baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        actionTimeout: 10_000,
    },
    timeout: 60_000,

    // CI only installs chromium (playwright.yml uses --with-deps chromium).
    // All three browsers run locally. Clipboard permissions are browser-specific:
    // WebKit does not support clipboard-write; we use a JS mock instead.
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],

    // When a remote deployment is configured, skip all local servers.
    // Otherwise start both the API and web frontend locally.
    webServer: process.env.WHISPER_BASE_URL
        ? undefined
        : [
              {
                  command: 'bun run dev',
                  url: 'http://localhost:3000/api/health',
                  reuseExistingServer: !process.env.CI,
              },
              {
                  command: 'bun run dev:web',
                  url: 'http://localhost:3001',
                  reuseExistingServer: !process.env.CI,
              },
          ],
});
