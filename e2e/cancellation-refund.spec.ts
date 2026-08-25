import { test, expect, type Page } from '@playwright/test';
import { firstAvailableSeat, seatButton, seatIdFromLocator } from './utils/seats';
import { isStripeConfigured } from './utils/env';

/**
 * SRS §D4.4 journey 4 (J8): cancellation round-trip with refund.
 *
 * Booking no longer has a `pending` status (server/src/models/Booking.js's
 * `status` enum is just `confirmed | cancelled`, ADR-014) — an unpaid
 * reservation is now a Hold, not a Booking. The old "cancel a pending
 * booking" test therefore has no equivalent any more; it's replaced below
 * with a hold-release test that exercises the same seat-round-trip idea one
 * layer earlier in the flow, and needs no Stripe at all since holds never
 * touch Stripe (D12).
 *
 * The second test — cancelling a real `confirmed` booking and checking the
 * refund — is unchanged in spirit. It still needs real Stripe TEST-mode keys
 * to reach a genuine `confirmed` booking, but no longer needs a webhook
 * forwarder to get there: confirmation is synchronous from the client's
 * perspective under ADR-014 (see README.md §8 and the
 * register-browse-book-pay-confirm spec).
 */

interface JourneyCustomer {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** Self-contained register -> verify -> login flow (mirrors J7's helper). */
async function registerVerifyAndLogin(page: Page): Promise<JourneyCustomer> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const customer: JourneyCustomer = {
    name: 'E2E Test Customer',
    email: `e2e.j8.${unique}@example.test`,
    phone: `07${unique.slice(-8).padStart(8, '1')}`,
    password: 'Password123!',
  };

  await page.goto('/register');
  await page.getByLabel('Full name').fill(customer.name);
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Mobile number').fill(customer.phone);
  await page.getByLabel('Password', { exact: true }).fill(customer.password);
  await page.getByLabel('Confirm password').fill(customer.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const mailResponse = await page.request.get(
    `/api/dev/last-mail?email=${encodeURIComponent(customer.email)}`,
  );
  expect(mailResponse.ok()).toBe(true);
  const mail = await mailResponse.json();
  const token = (mail.text as string).match(/token=([0-9a-f]+)/)?.[1];
  if (!token) {
    throw new Error(`No verification token found in the email sent to ${customer.email}: ${mail.text}`);
  }

  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByText('Your email is verified')).toBeVisible();

  await page.goto('/login');
  const form = page.locator('form');
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Password', { exact: true }).fill(customer.password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  return customer;
}

/** Browse to a showtime, select the first available seat, and create a Hold. */
async function selectSeatAndCreateHold(page: Page) {
  await page.goto('/films');
  await page.getByRole('button', { name: /^View / }).first().click();
  await expect(page).toHaveURL(/\/films\/[^/]+$/);

  const showtimeButton = page
    .locator('[data-testid^="cinema-group-"] button')
    .filter({ hasNotText: 'Sold out' })
    .first();
  await expect(showtimeButton).toBeVisible();
  await showtimeButton.click();
  await expect(page).toHaveURL(/\/showtimes\/[^/]+$/);
  const showtimeUrl = page.url();

  const seat = firstAvailableSeat(page);
  await expect(seat).toBeVisible();
  const seatId = await seatIdFromLocator(seat);
  await seat.click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page).toHaveURL(/\/checkout\/[^/]+$/);
  const holdId = page.url().match(/\/checkout\/([^/]+)$/)![1];

  return { showtimeUrl, seatId, holdId };
}

async function authToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('encore_token'));
  if (!token) throw new Error('Expected an auth token in localStorage after logging in.');
  return token;
}

async function cancelBookingByReference(page: Page, reference: string) {
  await page.goto('/bookings');
  const row = page.locator('li', { hasText: reference });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Cancel booking' }).click();
  await page.getByRole('button', { name: 'Yes, cancel' }).click();
  await expect(page.getByText('Booking cancelled.')).toBeVisible();
  await expect(row.getByText('Cancelled', { exact: true })).toBeVisible();
  return row;
}

test('releasing a hold returns its seat to available (replaces the old pending-booking cancel)', async ({
  page,
}) => {
  // Holds never touch Stripe (D12) — this needs no Stripe configuration at all.
  await registerVerifyAndLogin(page);
  const { showtimeUrl, seatId, holdId } = await selectSeatAndCreateHold(page);

  // CheckoutPage has no explicit "cancel"/"release" button of its own, so
  // simulate an abandoned checkout the same way a closed tab or a lapsed
  // hold would: release the hold directly via its API (DELETE /api/holds/:id
  // — holdController.releaseHold, idempotent, 204 no body).
  const token = await authToken(page);
  const releaseResponse = await page.request.delete(`/api/holds/${holdId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(releaseResponse.ok()).toBe(true);

  // Round trip: a fresh navigation back to the showtime shows the seat this
  // hold reserved as available again (not claiming realtime here — that is
  // the dedicated realtime-seat-propagation spec's job).
  await page.goto(showtimeUrl);
  await expect(seatButton(page, seatId)).toHaveAttribute('aria-label', /, available$/);
});

test('cancelling a confirmed (paid) booking issues a refund and releases its seat', async ({ page }) => {
  test.skip(
    !isStripeConfigured(),
    'Reaching a real `confirmed` booking needs real Stripe TEST-mode keys in server/.env and ' +
      'client/.env (see the register-browse-book-pay-confirm spec) — a genuine refund can only ' +
      'be checked against a booking that actually went through Stripe, which this test ' +
      'deliberately does not fake.',
  );

  await registerVerifyAndLogin(page);
  const { showtimeUrl, seatId } = await selectSeatAndCreateHold(page);

  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();

  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
  await expect(stripeFrame.locator('body')).toBeVisible({ timeout: 15_000 });
  await stripeFrame.getByPlaceholder('Card number').fill('4242424242424242');
  await stripeFrame.getByPlaceholder('MM / YY').fill('12/34');
  await stripeFrame.getByPlaceholder('CVC').fill('123');
  const postalField = stripeFrame.getByPlaceholder('ZIP').or(stripeFrame.getByPlaceholder('Postal code'));
  if (await postalField.count()) {
    await postalField.first().fill('10100');
  }
  await page.getByRole('button', { name: 'Pay now' }).click();

  // ADR-014: confirmation is synchronous — no webhook forwarder needed to
  // reach `confirmed` any more.
  await expect(page).toHaveURL(/\/confirmation\/([^/]+)$/, { timeout: 20_000 });
  const bookingId = page.url().match(/\/confirmation\/([^/]+)$/)![1];
  await expect(page.getByRole('heading', { name: "You're going." })).toBeVisible({ timeout: 20_000 });
  const reference = (await page.getByText(/^Booking ENC-/).textContent())!.match(/ENC-[A-Z0-9-]+/)![0];

  const row = await cancelBookingByReference(page, reference);

  // MyBookingsPage renders a distinct "Refunded" badge once a cancelled
  // booking's paymentStatus is `refunded` (client/src/pages/MyBookingsPage.tsx).
  await expect(row.getByText('Refunded', { exact: true })).toBeVisible();

  // Cross-check against the authoritative source: the booking API response
  // itself, authenticated the same way the app's own axios client does
  // (Bearer token from localStorage — see client/src/lib/tokenStore.ts).
  const token = await authToken(page);
  const apiResponse = await page.request.get(`/api/bookings/${bookingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(apiResponse.ok()).toBe(true);
  const { booking } = await apiResponse.json();
  expect(booking.status).toBe('cancelled');
  expect(booking.paymentStatus).toBe('refunded');

  await page.goto(showtimeUrl);
  await expect(seatButton(page, seatId)).toHaveAttribute('aria-label', /, available$/);
});
