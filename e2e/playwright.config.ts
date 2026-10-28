import { defineConfig, devices } from '@playwright/test';

/**
 * eMAR end-to-end tests against a DISPOSABLE server, never a production or pilot instance (see e2e/run-e2e.sh).
 */
// Artifacts are written OUTSIDE the repo while running: `openmrs develop` watches the module folder and reloads the
// page on every new file.
const out = process.env.E2E_OUT ?? '/tmp/emar-e2e';

export default defineConfig({
  testDir: './specs',
  outputDir: `${out}/artifacts`,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: `${out}/result.json` }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    headless: true,
  },
});
