import { test, expect } from '@playwright/test';
import { loginAs } from './utils/auth';
import { SEEDED_CUSTOMERS } from './utils/env';

/**
 * SRS §D4.4 journey 5: auth enforcement on /admin as a customer.
 *
 * Read client/src/routes/AdminRoute.tsx before writing this (a later phase
 * extracted it out of App.tsx into its own file, unchanged in behaviour):
 * it does NOT silently redirect a non-admin away. For an authenticated
 * non-admin it renders an explicit `ForbiddenPage` component in place, at
 * the same /admin URL — a real "403" screen (eyebrow text "403", heading
 * "Backstage only.") rather than a bounce to "/" or "/login". This is a
 * genuine client-side UX decision on top of the server, which independently
 * enforces the same rule on every admin-only endpoint via `requireRole`
 * middleware regardless of what this route guard decides.
 */
test('a signed-in customer visiting /admin sees an explicit 403 screen, not a silent redirect', async ({ page }) => {
  await loginAs(page, SEEDED_CUSTOMERS[0].email, SEEDED_CUSTOMERS[0].password);

  await page.goto('/admin');

  // Still on /admin — proof this isn't a redirect to /login or /.
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('403', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backstage only.' })).toBeVisible();
  await expect(page.getByText("Your account doesn't have admin access to this area.")).toBeVisible();

  // The same guard covers other routes nested under the admin shell, not
  // just the index route — client/src/App.tsx has no /admin/* wildcard, so
  // this has to be one of the actually-registered nested paths
  // (client/src/pages/admin/AdminFilmsPage.tsx) for the request to reach
  // AdminRoute at all; an unregistered path like the old domain's
  // /admin/events would instead fall through to the public shell's
  // catch-all NotFoundPage route, never reaching this guard.
  await page.goto('/admin/films');
  await expect(page).toHaveURL(/\/admin\/films$/);
  await expect(page.getByRole('heading', { name: 'Backstage only.' })).toBeVisible();

  // Its own "Back to Encore" action is the only way out — not an automatic bounce.
  await page.getByRole('button', { name: 'Back to Encore' }).click();
  await expect(page).toHaveURL('/');
});

test('an anonymous visitor to /admin is redirected to /login (not shown the 403 screen)', async ({ page }) => {
  // AdminRoute checks `status === 'anonymous'` before `isAdmin` — an
  // unauthenticated visitor gets the ordinary /login redirect (with the
  // original path preserved in navigation state), the same as any other
  // ProtectedRoute. The 403 screen is reserved for an authenticated
  // customer specifically, not for "not logged in".
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});
