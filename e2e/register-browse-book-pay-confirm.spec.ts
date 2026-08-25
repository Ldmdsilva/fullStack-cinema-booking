import { test, expect, type Page } from '@playwright/test';
import { firstAvailableSeat, seatIdFromLocator } from './utils/seats';
import { isStripeConfigured } from './utils/env';

/**
 * SRS §D4.4 journey 1 (J7): register -> verify -> browse -> hold -> pay -> confirm.
 *
 * ADR-014 replaced the old webhook-driven Checkout-Session flow with a
 * Hold + PaymentIntent flow (see README.md §8 for the authoritative
 * explanation):
 *   1. POST /api/holds reserves the seats — no Stripe call at all.
 *   2. POST /api/holds/:id/payment-intent creates a Stripe PaymentIntent for
 *      that hold.
 *   3. The client confirms the payment with Stripe.js (Payment Element).
 *   4. The client calls POST /api/bookings/confirm {holdId} the instant
 *      Stripe reports success; the server re-derives payment truth directly
 *      from Stripe and creates the Booking synchronously.
 *
 * Register/verify/login/browse/select-seats/hold never touch Stripe, so they
 * always run for real. Only step 2 onward needs real Stripe TEST-mode keys
 * in server/.env + client/.env, so that's the only gate left — unlike the
 * old flow, there is no separate webhook-forwarding gate any more, since
 * confirmation is synchronous from the client's perspective and no longer
 * involves a webhook at all.
 */

interface JourneyCustomer {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * Self-contained register -> verify -> login flow, driving the real pages
 * end to end. Verification reads the link straight out of the dev-only
 * `/api/dev/last-mail` endpoint (README.md §6) rather than a real mailbox.
 */
async function registerVerifyAndLogin(page: Page): Promise<JourneyCustomer> {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const customer: JourneyCustomer = {
    name: 'E2E Test Customer',
    email: `e2e.j7.${unique}@example.test`,
    // PHONE_RE on LoginPage wants a Sri Lankan mobile shape: 0|+94|94 then 7XXXXXXXX.
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
  // D14: registration never logs the user in or navigates away — it swaps
  // the form for a "check your email" confirmation on the same /register URL.
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const mailResponse = await page.request.get(
    `/api/dev/last-mail?email=${encodeURIComponent(customer.email)}`,
  );
  expect(mailResponse.ok()).toBe(true);
  const mail = await mailResponse.json();
  // Tokens are 32 random bytes hex-encoded (server/src/services/tokenService.js) —
  // never contain punctuation, so this can't accidentally swallow the
  // trailing "." the email template puts right after the URL.
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

test('register, verify, browse, select seats, hold, pay, and confirm a booking', async ({ page }) => {
  await registerVerifyAndLogin(page);

  // Browse: films render from the real seeded catalogue (server/src/scripts/seed.js).
  await page.goto('/films');
  const firstFilm = page.getByRole('button', { name: /^View / }).first();
  await expect(firstFilm).toBeVisible();
  const filmLabel = await firstFilm.getAttribute('aria-label');
  await firstFilm.click();
  await expect(page).toHaveURL(/\/films\/[^/]+$/);

  // Pick the first showtime that still has availability.
  const showtimeButton = page
    .locator('[data-testid^="cinema-group-"] button')
    .filter({ hasNotText: 'Sold out' })
    .first();
  await expect(showtimeButton).toBeVisible();
  await showtimeButton.click();
  await expect(page).toHaveURL(/\/showtimes\/[^/]+$/);
  await expect(page.getByRole('group', { name: 'Seat selection map' })).toBeVisible();

  // Select a seat and continue — this creates the Hold. No Stripe involved
  // yet (D12): holds are pure seat reservations.
  const seat = firstAvailableSeat(page);
  await expect(seat).toBeVisible();
  const seatId = await seatIdFromLocator(seat);
  await seat.click();
  await expect(seat).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  await expect(page.getByText(seatId, { exact: false }).first()).toBeVisible();

  test.skip(
    !isStripeConfigured(),
    'server/.env and client/.env still carry placeholder Stripe keys in this environment — ' +
      `the hold for seat "${seatId}" on "${filmLabel}" was created for real, but creating a ` +
      'Stripe PaymentIntent for it (POST /api/holds/:id/payment-intent) and paying via Stripe.js ' +
      'needs real TEST-mode keys from https://dashboard.stripe.com/test/apikeys.',
  );

  // Pay: CheckoutPage creates the PaymentIntent automatically once the hold
  // loads, mounting Stripe's Payment Element inside its own iframe. Stripe.js
  // names Payment Element frames `__privateStripeFrame*` — documented
  // Stripe.js behaviour, not something this app controls.
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

  // ADR-014: no webhook wait. PaymentForm's `confirmBooking` calls
  // POST /api/bookings/confirm {holdId} the instant Stripe reports success,
  // and the server re-derives payment truth directly from Stripe — this
  // reaches /confirmation/:bookingId synchronously, with no reconciliation
  // polling needed for the happy path.
  await expect(page).toHaveURL(/\/confirmation\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: "You're going." })).toBeVisible({ timeout: 20_000 });
  const bookingText = page.getByText(/^Booking ENC-/);
  await expect(bookingText).toBeVisible();
  await expect(bookingText).toContainText('is confirmed');
  const reference = (await bookingText.textContent())!.match(/ENC-[A-Z0-9-]+/)![0];
  await expect(page.getByText(seatId, { exact: false }).first()).toBeVisible();

  // Bonus: the booking also shows up in My Bookings.
  await page.goto('/bookings');
  await expect(page.locator('li', { hasText: reference })).toBeVisible();
});
