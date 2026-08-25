import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './utils/auth';

/**
 * SRS §D4.4 journey (numbered J6 in the table, "J5" in this migration
 * phase's plan — the D13-unblocked password-reset round trip): request a
 * reset, redeem the emailed link, sign in with the new password, and prove
 * the old session is revoked everywhere (FR-15 / D4.3(d) / ADR-011).
 *
 * Deliberately self-contained rather than depending on the seed script's
 * three pre-verified customers (server/src/scripts/seed.js) — nothing in
 * playwright.config.ts's webServer or this repo runs that seed
 * automatically before e2e, so this spec registers and verifies its own
 * fresh user first via the same D13 dev-mail flow as
 * registration-verification.spec.ts. That keeps the spec collision-free on
 * repeated runs and independent of whatever seed state happens to exist.
 */

interface FreshCustomer {
  name: string;
  email: string;
  phone: string;
  password: string;
}

function freshCustomer(tag: string): FreshCustomer {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    name: 'E2E Reset Customer',
    email: `e2e-reset-${tag}-${unique}@example.com`,
    // server/src/utils/phone.js's normaliseLk wants `94` + leading `7` + 8
    // more digits (11 digits total).
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

/** D13 dev-only endpoint — see registration-verification.spec.ts for the
 * same helper's full rationale. Fetched via a relative `/api/...` path
 * through the Vite dev-server proxy, same as this suite's other specs. */
async function fetchLastMail(page: Page, email: string): Promise<LastMail> {
  const response = await page.request.get('/api/dev/last-mail', { params: { email } });
  expect(response.ok(), `GET /api/dev/last-mail?email=${email} should return the captured email`).toBeTruthy();
  return response.json();
}

/** Both the verify and reset emails embed the link as a plain
 * `<a href="...?token=...">` (server/src/templates/email/*.js) — pull the
 * token out of the raw HTML directly. */
function extractToken(html: string): string {
  const match = html.match(/[?&]token=([^"&\s]+)/);
  if (!match) {
    throw new Error(`Could not find a "token=" query param in the email HTML: ${html}`);
  }
  return decodeURIComponent(match[1]);
}

/** Registers and verifies a brand-new customer entirely via the API (no UI
 * driving here — the register/verify UI itself is already covered by
 * registration-verification.spec.ts), so this spec can get straight to the
 * password-reset journey it actually owns. */
async function setupVerifiedCustomer(page: Page, customer: FreshCustomer): Promise<void> {
  const registerResponse = await page.request.post('/api/auth/register', { data: customer });
  expect(registerResponse.status()).toBe(202);

  const mail = await fetchLastMail(page, customer.email);
  const token = extractToken(mail.html);

  const verifyResponse = await page.request.post('/api/auth/verify-email', { data: { token } });
  expect(verifyResponse.status()).toBe(200);
}

test('request a password reset, redeem the emailed link, and sign in with the new password', async ({ page }) => {
  const customer = freshCustomer('main');
  await setupVerifiedCustomer(page, customer);

  // Capture a real pre-reset session by signing in through the actual UI —
  // this is the token FR-15/D4.3(d) says must stop working once the
  // password is reset, so it needs to be a genuine JWT, not a stand-in.
  await loginAs(page, customer.email, customer.password);
  const oldToken = await page.evaluate(() => localStorage.getItem('encore_token'));
  expect(oldToken).toBeTruthy();

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(customer.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  // The endpoint (and this copy) is identical whether or not the address is
  // registered — anti-enumeration by design (authService.forgotPassword).
  await expect(
    page.getByText("If an account exists for that email, we've sent a password reset link. Please check your inbox."),
  ).toBeVisible();

  const mail = await fetchLastMail(page, customer.email);
  expect(mail.subject).toBe('Reset your Encore Cinemas password');
  const token = extractToken(mail.html);

  const newPassword = 'NewPassword456!';
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel('New password').fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();

  // D14/FR-15: a reset never auto-signs the user in — only `login` issues a JWT.
  await expect(page.getByRole('heading', { name: 'Password reset' })).toBeVisible();
  await expect(page.getByText('Your password has been reset — please log in again.')).toBeVisible();

  await loginAs(page, customer.email, newPassword);
  await expect(page.getByRole('link', { name: customer.name })).toBeVisible();

  // FR-15 / D4.3(d): resetPassword calls tokenDenylistService.revokeAllForUser,
  // so the JWT captured before the reset must now be rejected everywhere —
  // proven here with a direct API request (bypassing the page's own axios
  // client entirely, so client.ts's global 401 interceptor can't mask what
  // the server actually returned).
  const meResponse = await page.request.get('/api/users/me', {
    headers: { Authorization: `Bearer ${oldToken}` },
  });
  expect(meResponse.status()).toBe(401);
  const body = await meResponse.json();
  expect(body.error.code).toBe('TOKEN_REVOKED');
});
