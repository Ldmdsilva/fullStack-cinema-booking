import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth';
import { SEEDED_ADMIN } from './utils/env';

/**
 * SRS §D4.4 journey 3: admin lifecycle — cinema -> film -> showtime -> public
 * listing -> cancel.
 *
 * Uses the "Cancel showtime" action on AdminShowtimesPage
 * (client/src/pages/admin/AdminShowtimesPage.tsx's `confirmCancel`, a
 * `PATCH /showtimes/:id/cancel` per client/src/lib/api/showtimes.ts's
 * `cancel`) — the only lifecycle action the showtime admin UI exposes at
 * all: AdminShowtimeFormPage.tsx has no edit mode because the server has no
 * generic "update showtime" endpoint, only create + this dedicated cancel
 * action. The public showtime picker only ever returns `status: 'scheduled'`
 * showtimes (server/src/services/showtimeService.js's `listShowtimes`
 * filter), so cancelling is expected to make the showtime disappear from
 * its film's showtime picker immediately.
 */
test('create a cinema, create a film, create a showtime on it, see it listed, then cancel it', async ({ page }) => {
  const unique = Date.now();
  const cinemaName = `E2E Test Cinema ${unique}`;
  const cinemaCity = 'Testville';
  const filmTitle = `E2E Test Film ${unique}`;

  await loginAs(page, SEEDED_ADMIN.email, SEEDED_ADMIN.password);

  // --- Cinema ---
  await page.goto('/admin/cinemas/new');
  await page.getByLabel('Cinema name').fill(cinemaName);
  await page.getByLabel('City').fill(cinemaCity);
  await page.getByLabel('Full address').fill('1 Test Street');
  // AdminCinemaFormPage.tsx's default single screen (Screen 1, one
  // "standard" section over rows A-D x 10 seats/row = 40 seats) is valid
  // as-is — comfortably under the 300-seat-per-screen cap — so no need to
  // edit it for this journey; it's just proving the admin flow works, not
  // stress-testing capacity.
  await page.getByRole('button', { name: 'Create cinema' }).click();

  await expect(page).toHaveURL(/\/admin\/cinemas$/);
  await expect(page.getByText(cinemaName)).toBeVisible();

  // --- Film ---
  await page.goto('/admin/films/new');
  await page.getByLabel('Title').fill(filmTitle);
  await page.getByLabel('Genre (comma-separated)').fill('Test-genre');
  await page.getByLabel('Runtime (minutes)').fill('100');
  await page.getByLabel('Synopsis').fill('An E2E-created film for the admin lifecycle journey.');
  const today = new Date();
  await page.getByLabel('Release date').fill(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  // Certificate defaults to "U" and posterUrl is optional — neither needs
  // touching for this journey.
  await page.getByRole('button', { name: 'Create film' }).click();

  await expect(page).toHaveURL(/\/admin\/films$/);
  await expect(page.locator('tr', { hasText: filmTitle })).toBeVisible();

  // --- Showtime, referencing that film + cinema + screen ---
  await page.goto('/admin/showtimes/new');
  await page.getByLabel('Film').selectOption({ label: filmTitle });
  await page.getByLabel('Cinema').selectOption({ label: `${cinemaName}, ${cinemaCity}` });
  // The screen picker is disabled until the cinema's screens have loaded
  // (AdminShowtimeFormPage.tsx fetches the full Cinema, with screens, only
  // once a cinemaRef is chosen — the summary list used for the Cinema
  // dropdown has no screen data).
  await expect(page.getByLabel('Screen')).toBeEnabled();
  // Screen.capacity is kept in sync with seatLayout.length server-side
  // (server/src/models/Cinema.js's pre-save hook) — the default screen's
  // one "standard" section (rows A-D x 10 seats/row) is exactly 40 seats,
  // and AdminShowtimeFormPage.tsx's option label is "<name> (<capacity> seats)".
  await page.getByLabel('Screen').selectOption({ label: 'Screen 1 (40 seats)' });

  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days out
  const localDatetime = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T20:00`;
  await page.getByLabel('Starts at').fill(localDatetime);
  await page.getByLabel('Base price (LKR)').fill('1500');

  // Tier-price preview live-updates off the base price using the system's
  // fixed multipliers (server/src/config/seatTiers.js: standard x1.0,
  // premium x1.35, recliner x1.8) — Math.round() in
  // AdminShowtimeFormPage.tsx keeps these exact regardless of
  // floating-point multiplication.
  await expect(page.getByText('Standard: Rs 1,500.00')).toBeVisible();
  await expect(page.getByText('Premium: Rs 2,025.00')).toBeVisible();
  await expect(page.getByText('Recliner: Rs 2,700.00')).toBeVisible();

  await page.getByRole('button', { name: 'Create showtime' }).click();

  await expect(page).toHaveURL(/\/admin\/showtimes$/);
  await page.getByLabel('Search showtimes').fill(filmTitle);
  const adminShowtimeRow = page.locator('tr', { hasText: filmTitle });
  await expect(adminShowtimeRow).toBeVisible();
  await expect(adminShowtimeRow.getByText('scheduled', { exact: true })).toBeVisible();

  // --- Public listing: film -> showtime picker ---
  await page.goto('/films');
  await page.getByLabel('Search').fill(filmTitle);
  await expect(page).toHaveURL(/q=/); // debounced search lands in the URL
  await page.getByRole('button', { name: `View ${filmTitle}` }).click();

  await expect(page).toHaveURL(/\/films\/[^/]+$/);
  await expect(page.getByRole('heading', { name: filmTitle })).toBeVisible();
  // FilmDetailPage.tsx renders a bookable showtime as "<time> from <price>"
  // and a sold-out one (disabled) as "<time> Sold out" — this one has all
  // 40 seats free, so it must show the former.
  await expect(page.getByRole('button', { name: /from Rs/ })).toBeVisible();

  // --- Cancel ---
  await page.goto('/admin/showtimes');
  await page.getByLabel('Search showtimes').fill(filmTitle);
  // The row's cancel trigger is an icon-only button identified only by its
  // `title` attribute (AdminShowtimesPage.tsx), not visible text — matched
  // the same way AdminShowtimesPage.test.tsx matches it
  // (`getAllByTitle('Cancel showtime')`), rather than via accessible-name
  // role matching.
  await adminShowtimeRow.getByTitle('Cancel showtime').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel showtime' }).click();
  await expect(adminShowtimeRow.getByText('cancelled', { exact: true })).toBeVisible();

  // A cancelled showtime drops out of the public (status: 'scheduled' only)
  // showtime picker for its film.
  await page.goto('/films');
  await page.getByLabel('Search').fill(filmTitle);
  await expect(page).toHaveURL(/q=/);
  await page.getByRole('button', { name: `View ${filmTitle}` }).click();
  await expect(page).toHaveURL(/\/films\/[^/]+$/);
  await expect(page.getByRole('button', { name: /from Rs/ })).toHaveCount(0);
  await expect(page.getByText('No upcoming showtimes for this film')).toBeVisible();
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
