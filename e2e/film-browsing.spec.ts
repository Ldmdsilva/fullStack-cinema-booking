import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * SRS §D4.4 journey J2 — "browse and filter films": a visitor browses films
 * now showing, opens a film's detail page, filters its showtimes by
 * cinema/date (FR-19-21), and picks one to reach seat selection. No
 * authentication is required anywhere in this journey — see
 * client/src/App.tsx, where /films, /films/:id and /showtimes/:id are all
 * outside `ProtectedRoute`.
 */

interface ShowtimeSummary {
  id: string;
  cinema: { id: string; name: string; city?: string } | null;
  startsAt: string;
}

/**
 * Mirrors FilmDetailPage.tsx's own `dateKey()` exactly (local-timezone
 * year/month/day, not a raw ISO-string slice): the picker groups by the
 * *browser's* local calendar day, and this test runs Node and the browser
 * on the same host, so computing the key the same way here — rather than
 * slicing the UTC ISO string — keeps the two in agreement even for a
 * showtime near a local midnight boundary.
 */
function dateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Picks a film (from the real seeded catalogue, server/src/scripts/seed.js)
 * whose upcoming showtimes span more than one cinema or, failing that, more
 * than one calendar date — so a cinema/date filter has something genuine to
 * narrow. Not every film's showtimes do (e.g. a film screening at only one
 * cinema on one date), so this reads the same public API the page itself
 * calls (GET /api/films, GET /api/showtimes) to find a good candidate
 * instead of hard-coding a title that a future reseed could invalidate.
 */
async function findFilterableFilm(
  request: APIRequestContext,
): Promise<{ filmId: string; filterKind: 'cinema' | 'date'; showtimes: ShowtimeSummary[] } | null> {
  const filmsRes = await request.get('/api/films', { params: { limit: 50 } });
  expect(filmsRes.ok()).toBe(true);
  const films = (await filmsRes.json()).items as { id: string }[];

  for (const film of films) {
    const showtimesRes = await request.get('/api/showtimes', { params: { filmId: film.id, limit: 100 } });
    expect(showtimesRes.ok()).toBe(true);
    const showtimes = (await showtimesRes.json()).items as ShowtimeSummary[];
    if (showtimes.length < 2) continue;

    const cinemaIds = new Set(showtimes.map((s) => s.cinema?.id));
    if (cinemaIds.size > 1) return { filmId: film.id, filterKind: 'cinema', showtimes };

    const dateKeys = new Set(showtimes.map((s) => dateKey(s.startsAt)));
    if (dateKeys.size > 1) return { filmId: film.id, filterKind: 'date', showtimes };
  }

  return null;
}

test('a visitor browses films with no login, opens a detail page, and reaches seat selection', async ({ page }) => {
  await page.goto('/films');

  // FR-19: the catalogue renders for an anonymous visitor.
  await expect(page.getByRole('heading', { name: 'Now showing' })).toBeVisible();
  const filmCards = page.getByRole('button', { name: /^View / });
  await expect(filmCards.first()).toBeVisible();
  expect(await filmCards.count()).toBeGreaterThan(0);

  // Open a film's detail page via a real click-through (not a direct
  // navigation), proving the card itself is the entry point FR-20 describes.
  await filmCards.first().click();
  await expect(page).toHaveURL(/\/films\/[^/]+$/);

  // Film info renders: title, certificate/runtime eyebrow, synopsis. Scoped
  // to `main header` — AppShell's own site-nav <header> (Header() in
  // client/src/components/layout/AppShell.tsx) is a second <header> on
  // every page, so an unscoped `header` locator would be ambiguous.
  const filmHeader = page.locator('main header');
  await expect(filmHeader.getByRole('heading', { level: 1 })).toBeVisible();
  const infoParagraphs = filmHeader.locator('p');
  await expect(infoParagraphs.first()).toBeVisible(); // certificate · runtime eyebrow
  await expect(infoParagraphs.last()).not.toBeEmpty(); // synopsis

  // The showtime picker section, grouped by cinema then date (FR-21) —
  // see FilmDetailPage.tsx's groupShowtimes().
  await expect(page.getByRole('heading', { name: 'Showtimes' })).toBeVisible();
});

test('filtering a film\'s showtimes by cinema or date narrows the picker (FR-21)', async ({ page }) => {
  const found = await findFilterableFilm(page.request);
  test.skip(found === null, 'No seeded film currently has upcoming showtimes spanning more than one cinema or date to filter against.');
  const { filmId, filterKind, showtimes } = found!;

  await page.goto(`/films/${filmId}`);
  await expect(page.getByRole('heading', { name: 'Showtimes' })).toBeVisible();

  const groupsBefore = page.locator('[data-testid^="cinema-group-"]');
  await expect(groupsBefore.first()).toBeVisible();
  const groupCountBefore = await groupsBefore.count();
  const totalSlotsBefore = new Set(showtimes.map((s) => s.id)).size;

  if (filterKind === 'cinema') {
    // Narrow to a single cinema — the group count must drop to exactly one,
    // and only that cinema's showtimes remain.
    const targetCinema = showtimes[0].cinema!;
    await page.getByLabel('Cinema').selectOption(targetCinema.id);
    await expect(page).toHaveURL(new RegExp(`cinema=${targetCinema.id}`));

    const groupsAfter = page.locator('[data-testid^="cinema-group-"]');
    await expect(groupsAfter).toHaveCount(1);
    await expect(page.locator(`[data-testid="cinema-group-${targetCinema.id}"]`)).toBeVisible();
  } else {
    // Narrow to a single date — the picker must show fewer total showtime
    // slots than the unfiltered view (unless every showtime already fell on
    // that one date, which findFilterableFilm already ruled out by only
    // choosing a 'date' film when >1 distinct date exists).
    const targetDateKey = dateKey(showtimes[0].startsAt);
    await page.getByLabel('Date').fill(targetDateKey);
    await expect(page).toHaveURL(new RegExp(`date=${targetDateKey}`));

    const showtimesOnTargetDate = showtimes.filter((s) => dateKey(s.startsAt) === targetDateKey).length;
    const slotButtons = page.locator('[data-testid^="cinema-group-"] button');
    await expect(slotButtons).toHaveCount(showtimesOnTargetDate);
    expect(showtimesOnTargetDate).toBeLessThan(totalSlotsBefore);
  }

  expect(groupCountBefore).toBeGreaterThanOrEqual(1);

  // Clicking a showtime slot navigates to seat selection (FR-26). Skip a
  // sold-out slot (rendered `disabled` — see FilmDetailPage.tsx) since it
  // can't be clicked through.
  const slot = page.locator('[data-testid^="cinema-group-"] button:not([disabled])').first();
  await expect(slot).toBeVisible();
  await slot.click();
  await expect(page).toHaveURL(/\/showtimes\/[^/]+$/);
  await expect(page.getByRole('group', { name: 'Seat selection map' })).toBeVisible();
});
