import { defineConfig, devices } from '@playwright/test';

const useRemoteApi = !!process.env.WHISPER_API_URL;
const useRemoteWeb = !!process.env.WHISPER_WEB_URL;
const useFullyRemote = useRemoteApi && useRemoteWeb;
const apiBaseUrl = process.env.WHISPER_API_URL ?? 'http://localhost:3000';

// Local web server entries, conditionally included
const localApiServer = {
    // bun run dev uses in-memory storage — no Redis credentials needed locally.
    // vercel dev requires Upstash env vars; use WHISPER_API_URL for that in CI.
    command: 'bun run dev',
    url: `${apiBaseUrl}/api/health`,
    reuseExistingServer: !process.env.CI,
};
const localWebServer = {
    command: 'bun run dev:web',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    // When using a remote API, tell Next.js to proxy /api/* there instead of localhost:3000.
    env: useRemoteApi ? { API_URL: process.env.WHISPER_API_URL! } : undefined,
};

export default defineConfig({
    testDir: './apps/web/tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'html',
    use: {
        baseURL: process.env.WHISPER_WEB_URL ?? 'http://localhost:3001',
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

    // When both services are remote (CI with deployed URLs), skip all local servers.
    // When only the API is remote, still start the web frontend locally.
    // When nothing is remote, start both.
    webServer: useFullyRemote
        ? undefined
        : useRemoteApi
          ? [localWebServer]
          : [localApiServer, localWebServer],
});
