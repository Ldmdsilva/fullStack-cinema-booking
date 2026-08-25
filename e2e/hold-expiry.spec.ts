import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerVerifiedAndLoggedIn } from './utils/verifiedCustomer';
import { firstAvailableSeat, seatButton, seatIdFromLocator } from './utils/seats';

/**
 * SRS §D4.4 journey J5 — "hold expiry, no Stripe key required (D12)": past a
 * hold's expiry, the seat reads `available` and is re-holdable BEFORE the
 * sweeper ever runs (FR-31's live `effectiveSeatStatus` read-through —
 * server/src/serializers/showtimeSerializer.js — not the sweeper being the
 * source of truth for the read); the sweeper's separate job is only to
 * eventually release+broadcast so nobody has to keep re-fetching forever.
 *
 * **The short-TTL problem.** `env.HOLD_TTL_MINUTES` defaults to 10 minutes
 * (server/.env) and the sweeper runs every 60s (server/src/jobs/
 * holdReaper.js) — waiting out either in real time would make this spec
 * absurdly slow, and a 10-minute real wait is not something to build into a
 * suite meant to run on demand (§D7).
 *
 * There was no existing per-request or env-var override for the hold TTL —
 * `holdService.createHold` read `env.HOLD_TTL_MINUTES` unconditionally. This
 * spec adds one, but deliberately NOT as a global env var
 * (`HOLD_TTL_MINUTES`/`E2E_HOLD_TTL_MINUTES` in server/.env would shrink
 * every hold's lifetime for the entire e2e run, including the payment
 * journey's Stripe Checkout + webhook wait and the reconnect-recovery
 * journey — both can legitimately take longer than a few seconds, and nothing
 * about how the webServer is started lets one spec opt out of a
 * process-wide env var while another opts in). Instead, `holdController.js`
 * reads an optional `X-E2E-Hold-Ttl-Ms` request header — honoured ONLY when
 * `NODE_ENV !== 'production'`, and only ever set by this one test via
 * `page.route()` on exactly the `POST /api/holds` request it triggers by
 * clicking "Continue". Every other spec's holds (including the rewritten
 * realtime-propagation journey) are completely unaffected: they never send
 * the header, so they keep the real `HOLD_TTL_MINUTES` default. This is a
 * small, additive, test-only server change (see holdController.js and
 * holdService.js's `ttlMs` parameter), covered by two new cases in
 * server/tests/unit/holdService.test.js.
 */
const SHORT_TTL_MS = 5_000;
// Comfortably clear of SHORT_TTL_MS so the wait is never a timing coin-flip,
// and comfortably under holdReaper.js's 60s sweep cadence so a seat reading
// `available` here can only be the live read-through, never the sweeper.
const WAIT_PAST_EXPIRY_MS = SHORT_TTL_MS + 3_000;

test('past expiry a held seat reads available again and is re-holdable, before the sweeper runs', async ({ page }) => {
  await registerVerifiedAndLoggedIn(page);

  const showtimeId = await findShowtimeWithAvailableSeat(page.request);
  const showtimeUrl = `/showtimes/${showtimeId}`;
  await page.goto(showtimeUrl);
  await expect(page.getByRole('group', { name: 'Seat selection map' })).toBeVisible();

  const seat = firstAvailableSeat(page);
  await expect(seat).toBeVisible();
  const seatId = await seatIdFromLocator(seat);

  // Test-only: shrink the TTL of exactly the hold this click is about to
  // create. See the file-level comment for why this rides on a header
  // rather than a global env var.
  await page.route('**/api/holds', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.continue({
      headers: { ...route.request().headers(), 'x-e2e-hold-ttl-ms': String(SHORT_TTL_MS) },
    });
  });

  await seat.click();
  await expect(seat).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/[^/]+$/);

  // Real-time wait: no DB access from e2e, so there is no way to fast-forward
  // the clock — this is the one deliberate real-time wait in the spec.
  await page.waitForTimeout(WAIT_PAST_EXPIRY_MS);

  // Re-navigate (not the checkout page, which is a dead end for an expired
  // hold) straight back to the showtime — a fresh GET, no cached seat state
  // anywhere (NFR-15b), so whatever status comes back is derived live.
  await page.goto(showtimeUrl);
  const seatAgain = seatButton(page, seatId);
  await expect(seatAgain).toHaveAttribute('aria-label', /, available$/);

  // The proof that actually matters: the seat isn't just cosmetically
  // "available" — it can be held again, successfully, right now. (The
  // sweeper's own release+broadcast is exercised by the rewritten
  // realtime-propagation spec's assertion pattern already; re-waiting the
  // full 60s here to watch it fire a second time would add real time to
  // every run for no additional coverage.)
  await seatAgain.click();
  await expect(seatAgain).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/[^/]+$/);
});

/**
 * Finds a scheduled showtime (server/src/scripts/seed.js's fixtures, or
 * whatever else the running database currently has) with at least one seat
 * effectively available right now, per the same public listing the film
 * detail page itself calls.
 */
async function findShowtimeWithAvailableSeat(request: APIRequestContext): Promise<string> {
  const response = await request.get('/api/showtimes', { params: { limit: 100 } });
  expect(response.ok()).toBe(true);
  const items = (await response.json()).items as { id: string; availableSeats: number }[];
  const candidate = items.find((s) => s.availableSeats > 0);
  if (!candidate) {
    throw new Error('No scheduled showtime with an available seat was found — is the database seeded?');
  }
  return candidate.id;
}
