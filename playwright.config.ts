import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const REPO_ROOT = __dirname;

/**
 * System / E2E config (Phase 7, SRS §D4.4). Lives at the repo root — see
 * `.github/workflows/ci.yml`'s `e2e` job, which runs `npx playwright test`
 * from the repo root on `workflow_dispatch` only (§D7: on demand / at
 * milestones, never on every push).
 *
 * Prerequisites this config assumes are already in place (it does not set
 * them up itself):
 *   - server/.env and client/.env populated from their .env.example files,
 *     with a real MONGODB_URI (Atlas or local) the server can connect to.
 *   - For the payment-dependent specs, real Stripe TEST-mode keys
 *     (STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY / VITE_STRIPE_PUBLISHABLE_KEY).
 *     Specs detect placeholder keys (see e2e/utils/env.ts) and skip the
 *     parts of the journey that need a real key, with a clear reason.
 *     Confirmation itself is synchronous from the client's perspective
 *     (ADR-014) — no webhook, no forwarding process, so real Stripe keys are
 *     the only external prerequisite left for the payment journeys.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Two-context realtime/reconnect specs and payment specs against a real
  // Stripe test account can run slower than typical UI tests.
  timeout: 60_000,
  expect: {
    // Realtime seat propagation only needs to settle within ~1-2s per the
    // plan (a socket round trip plus a React re-render) — not instant, but
    // not the default 5s blanket either. Individual assertions can still
    // override this with their own `{ timeout }`.
    timeout: 5_000,
  },
  // Explicit folders: reporter/output paths default to resolving against
  // the CLI's cwd (repo root), not this config's own directory, which would
  // otherwise leave stray report/results dirs at the repo root.
  outputDir: path.join(__dirname, 'test-results'),
  reporter: [['html', { open: 'never', outputFolder: path.join(__dirname, 'playwright-report') }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Playwright starts (or reuses) both dev servers itself so `npx playwright
  // test` works from a clean checkout — see the CI `e2e` job, which does
  // `npm ci` in server/ and client/ but never runs them directly.
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:5000/api/health',
      cwd: REPO_ROOT,
      reuseExistingServer: !process.env.CI,
      // The server awaits a MongoDB connection before it ever listens
      // (see server/src/server.js) and exits(1) if that connection fails,
      // so this timeout is really "how long to wait for Mongo", not for
      // Express itself to boot. A placeholder Atlas URI fails fast (DNS
      // EBADNAME on the SRV lookup) rather than hanging out this timeout,
      // but a real Atlas cluster on a cold start can take a few seconds.
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:client',
      url: 'http://localhost:5173',
      cwd: REPO_ROOT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
