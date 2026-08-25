import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './utils/auth';

/**
 * SRS §D4.4 — the D13-unblocked leg of journey J1: register, verify the
 * emailed link, then sign in. (J1's full continuation into browse -> hold ->
 * pay -> confirm lives in register-browse-book-pay-confirm.spec.ts; this
 * spec's job is specifically the register/verify half the migration plan
 * calls out as newly automatable now that `GET /api/dev/last-mail` (D13)
 * exists — there was previously no way to read a real verification email
 * from inside a test.)
 *
 * Per D14, `POST /api/auth/register` returns 202 with only a message, never
 * a token — the UI (LoginPage.tsx) swaps in a "Check your email"
 * confirmation on the same /register URL rather than navigating or signing
 * the user in. `login` remains the only endpoint that ever issues a JWT.
 */

interface FreshCustomer {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** A fresh, collision-free customer — unique email per call so re-running
 * this suite never collides with a previous run's leftover user. */
function freshCustomer(tag: string): FreshCustomer {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    name: 'E2E Verify Customer',
    email: `e2e-verify-${tag}-${unique}@example.com`,
    // server/src/utils/phone.js's normaliseLk wants a Sri Lankan mobile
    // shape: `94` + a leading `7` + 8 more digits (11 digits total).
    phone: `947${unique.slice(-8).padStart(8, '1')}`,
    password: 'Password123!',
  };
}

interface LastMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: string;
}

/**
 * D13 dev-only endpoint (server/src/routes/devRoutes.js, mounted only when
 * NODE_ENV !== 'production', which the e2e dev server is). Fetched via
 * `page.request` against a relative `/api/...` path — the same pattern
 * other specs use (e.g. cancellation-refund.spec.ts's booking-status poll),
 * relying on the Vite dev-server proxy (client/vite.config.ts) to forward
 * `/api` to the server on port 5000.
 */
async function fetchLastMail(page: Page, email: string): Promise<LastMail> {
  const response = await page.request.get('/api/dev/last-mail', { params: { email } });
  expect(response.ok(), `GET /api/dev/last-mail?email=${email} should return the captured email`).toBeTruthy();
  return response.json();
}

/** The verify/reset link is a plain `<a href="...?token=...">` in the email
 * HTML (server/src/templates/email/verifyEmail.js and passwordReset.js) —
 * pull the token straight out of the raw HTML rather than assuming any
 * particular link path, so this only breaks if the token itself moves. */
function extractToken(html: string): string {
  const match = html.match(/[?&]token=([^"&\s]+)/);
  if (!match) {
    throw new Error(`Could not find a "token=" query param in the email HTML: ${html}`);
  }
  return decodeURIComponent(match[1]);
}

test('register, verify the emailed link via the D13 dev-mail endpoint, then sign in', async ({ page }) => {
  const customer = freshCustomer('main');

  await page.goto('/register');
  await page.getByLabel('Full name').fill(customer.name);
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Mobile number').fill(customer.phone);
  await page.getByLabel('Password', { exact: true }).fill(customer.password);
  await page.getByLabel('Confirm password').fill(customer.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // D14 "check your email" state — still on /register, no auto sign-in.
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(
    page.getByText('Registration successful — check your email to verify your account.'),
  ).toBeVisible();

  const mail = await fetchLastMail(page, customer.email);
  expect(mail.subject).toBe('Verify your Encore Cinemas account');
  const token = extractToken(mail.html);

  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByText('Your email is verified — you can now book tickets.')).toBeVisible();

  // Anonymous at this point, so the success CTA reads "Sign in" and lands on /login.
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginAs(page, customer.email, customer.password);
  await expect(page.getByRole('link', { name: customer.name })).toBeVisible();
});

// Kept as its own test (not tangled into the flow above) per the plan's
// preference — proves FR-6: an unverified account cannot create a seat
// hold. `requireVerified` runs before the request body is even validated
// (server/src/routes/holdRoutes.js: verifyToken -> requireVerified ->
// validate(...) -> controller), so an empty hold body is enough to reach
// the EMAIL_NOT_VERIFIED gate without needing a real showtime/seat id.
test('an unverified account is blocked from creating a seat hold with EMAIL_NOT_VERIFIED', async ({ page }) => {
  const customer = freshCustomer('fr6');

  const registerResponse = await page.request.post('/api/auth/register', { data: customer });
  expect(registerResponse.status()).toBe(202);

  const loginResponse = await page.request.post('/api/auth/login', {
    data: { email: customer.email, password: customer.password },
  });
  expect(loginResponse.ok()).toBeTruthy();
  const { token } = await loginResponse.json();

  const holdResponse = await page.request.post('/api/holds', {
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });
  expect(holdResponse.status()).toBe(403);
  const body = await holdResponse.json();
  expect(body.error.code).toBe('EMAIL_NOT_VERIFIED');
});
