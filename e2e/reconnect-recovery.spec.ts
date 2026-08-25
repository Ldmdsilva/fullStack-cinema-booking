import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth';
import { SEEDED_CUSTOMERS } from './utils/env';

/**
 * SRS §D4.4 journey 6: reconnect recovery, on the Showtime domain.
 *
 * The real signal to assert against, read from the actual code rather than
 * guessed:
 *   - client/src/context/SocketContext.tsx exposes `isConnected` (flipped by
 *     the socket's own `connect`/`disconnect` events) and a `reconnectCount`
 *     that bumps specifically on `socket.io`'s `reconnect` event.
 *   - client/src/pages/ShowtimePage.tsx renders that `isConnected` state
 *     directly as visible text next to a Radio icon, in a "Connection" `dl`
 *     row: "Live" vs "Connecting…".
 *   - client/src/hooks/useShowtimeSeats.ts has an effect keyed on
 *     `reconnectCount` that calls `load('RESYNC')` — i.e. a full re-fetch of
 *     GET /api/showtimes/:id — specifically so a reconnect never trusts
 *     whatever seat state was cached across the gap (the effect's own
 *     comment cites FR-16/R7 for this).
 *
 * Rather than killing the actual dev server process (which is shared by
 * the whole Playwright run via the `webServer` config and would break every
 * other test), this simulates the socket disconnect via
 * `browserContext.setOffline()` — a real network-level cut that both HTTP
 * and the WebSocket transport have to recover from, without touching any
 * server process other tests depend on.
 */
test('after a connection drop, the client shows a reconnecting state and re-fetches seat state (not stale cache)', async ({
  page,
  context,
}) => {
  await loginAs(page, SEEDED_CUSTOMERS[0].email, SEEDED_CUSTOMERS[0].password);

  // Browse -> a film with at least one bookable showtime -> its seat page.
  // FilmCard (client/src/components/FilmCard.tsx) gives every poster an
  // aria-label "View <title>"; FilmDetailPage's showtime buttons render
  // "from Rs …" for anything with seats left (a sold-out showtime instead
  // says "Sold out" and is disabled) — seed data guarantees at least one of
  // each per film.
  await page.goto('/films');
  await page.getByRole('button', { name: /^View / }).first().click();
  await expect(page).toHaveURL(/\/films\/[^/]+$/);
  await page.getByRole('button', { name: /from Rs/ }).first().click();
  await expect(page).toHaveURL(/\/showtimes\/[^/]+$/);
  // The client route is /showtimes/:id; showtimesApi.getById() calls
  // GET /showtimes/:id against the axios baseURL "/api" — i.e. exactly
  // `/api` + this pathname.
  const showtimeApiPath = `/api${new URL(page.url()).pathname}`;

  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  let fetchesAfterLoad = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === showtimeApiPath) {
      fetchesAfterLoad += 1;
    }
  });

  // Simulate the connection dropping.
  await context.setOffline(true);
  // Socket.IO transport failure detection isn't instant (it depends on the
  // active transport's own error/ping handling), so this is given a
  // generous window rather than the config's tighter realtime-propagation
  // timeout.
  await expect(page.getByText('Connecting…', { exact: true })).toBeVisible({ timeout: 15_000 });

  // Restore the connection and let Socket.IO's own reconnection logic run.
  await context.setOffline(false);
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 });

  // The reconnect must have driven a real re-fetch of authoritative seat
  // state — not just the UI flipping back to "Live" while quietly trusting
  // whatever seat array it had cached from before the drop.
  await expect
    .poll(() => fetchesAfterLoad, {
      message: 'expected a GET /api/showtimes/:id re-fetch after the reconnect (useShowtimeSeats.ts RESYNC)',
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
});
