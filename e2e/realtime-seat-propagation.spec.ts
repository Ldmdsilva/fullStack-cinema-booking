import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerVerifiedAndLoggedIn } from './utils/verifiedCustomer';
import { seatButton, firstAvailableSeat, seatIdFromLocator } from './utils/seats';

/**
 * SRS §D4.4 journey J4 — the "marquee test": a hold placed in browser
 * context A greys the seat out in browser context B within ~1-2s, with no
 * refresh in B.
 *
 * D12 makes this journey ungated: `POST /api/holds` flips a seat to `held`
 * and broadcasts `seats:updated` with ZERO Stripe interaction (see
 * server/src/services/holdService.js's `createHold`) — a distinct,
 * server-side-only step from `POST /api/holds/:id/payment-intent`, which is
 * a separate follow-up call this journey never needs to make. So this test
 * drives the UI only as far as clicking "Continue" on the seat-selection
 * page (client/src/pages/ShowtimePage.tsx's `onContinue`, which calls
 * `holdsApi.create`) rather than going all the way through to payment —
 * there is no more "only Stripe can trigger a `held` broadcast" limitation
 * to work around.
 *
 * Holds require an email-verified account (`requireVerified` middleware on
 * `POST /api/holds`), so context A registers and verifies a fresh customer
 * inline via the dev mailbox (D13) rather than reusing a seeded one.
 */
test('a seat held in one browser context greys out in another within ~2s, no reload', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // Context A: a fresh, verified, signed-in customer about to hold a seat.
    await registerVerifiedAndLoggedIn(pageA);

    const showtimeId = await findShowtimeWithAvailableSeat(pageA.request);
    const showtimeUrl = `/showtimes/${showtimeId}`;

    await pageA.goto(showtimeUrl);
    await expect(pageA.getByRole('group', { name: 'Seat selection map' })).toBeVisible();

    // Context B: any viewer (no login needed to watch the seat map) looking
    // at the exact same showtime, at the same time.
    await pageB.goto(showtimeUrl);
    await expect(pageB.getByRole('group', { name: 'Seat selection map' })).toBeVisible();

    const seatOnA = firstAvailableSeat(pageA);
    await expect(seatOnA).toBeVisible();
    const seatId = await seatIdFromLocator(seatOnA);
    const seatOnB = seatButton(pageB, seatId);
    await expect(seatOnB).toHaveAttribute('aria-label', /, available$/);

    // Both sides join the same Socket.IO `showtime:<id>` room on mount (see
    // useShowtimeSeats.ts's join-on-mount effect) — B never reloads from
    // here on.
    await seatOnA.click();
    await expect(seatOnA).toHaveAttribute('aria-pressed', 'true');
    await pageA.getByRole('button', { name: 'Continue', exact: true }).click();

    // This IS the hold — a plain `POST /api/holds`, no Stripe call, no
    // PaymentIntent. Reaching /checkout confirms it succeeded server-side.
    await expect(pageA).toHaveURL(/\/checkout\/[^/]+$/);

    // Config sets a 5s default expect timeout; the plan calls for tolerating
    // up to ~1-2s for this propagation, not instant, so this is generous
    // relative to the ~1s target while still catching a genuine regression.
    await expect(seatOnB).toHaveAttribute('aria-label', /on hold by another customer/, { timeout: 2_000 });
    await expect(seatOnB).toBeDisabled();

    // Confirm B's local selection state (had it selected the same seat)
    // would also have been dropped — REMOTE_UPDATE in useShowtimeSeats.ts
    // deselects any seat that a remote update marks non-available.
    await expect(seatOnB).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/**
 * Finds a scheduled showtime (server/src/scripts/seed.js's fixtures, or
 * whatever else the running database currently has) with at least one seat
 * effectively available right now, per the same public listing the film
 * detail page itself calls. Reading this via the API instead of hunting
 * through the UI keeps this test independent of which film/cinema/date
 * happens to be seeded, and of how many seats earlier test runs may have
 * already consumed.
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
