import { expect, type Page } from '@playwright/test';
import { buildNewCustomer, type NewCustomer } from './auth';

/**
 * Registers a brand-new customer, verifies their email via the dev-only
 * mailbox capture (`GET /api/dev/last-mail`, D13), then logs in — the
 * register -> verify -> login sequence SRS §D4.4 journey J1 describes.
 *
 * Holds (`POST /api/holds`, D12) require an email-verified account
 * (`requireVerified` middleware) — see server/src/routes/holdRoutes.js —
 * so both the realtime-propagation (J4/"realtime seat updates") and
 * hold-expiry (J5) journeys need a verified, logged-in customer before they
 * can ever touch a seat. A freshly registered customer is one less thing to
 * keep in sync with `server/src/scripts/seed.js` than reusing a seeded one.
 *
 * D14 facts this relies on (see client/src/pages/LoginPage.tsx and
 * VerifyEmailPage.tsx): registration never issues a token and never
 * navigates away — it swaps the form for a "check your email" panel in
 * place — and login is the only place a JWT is minted, so this helper signs
 * in explicitly as its last step rather than assuming registration did it.
 */
export async function registerVerifiedAndLoggedIn(page: Page): Promise<NewCustomer> {
  const customer = buildNewCustomer();

  await page.goto('/register');
  await page.getByLabel('Full name').fill(customer.name);
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Mobile number').fill(customer.phone);
  await page.getByLabel('Password', { exact: true }).fill(customer.password);
  await page.getByLabel('Confirm password').fill(customer.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // D14: the register tab replaces itself with a "check your email" panel
  // rather than navigating anywhere.
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const verifyUrl = await readVerifyEmailLink(page, customer.email);
  await page.goto(verifyUrl);
  await expect(page.getByText('Your email is verified')).toBeVisible();

  // From the verify-success screen, an anonymous visitor is offered a
  // "Sign in" button rather than being logged in automatically.
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);

  const form = page.locator('form');
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Password', { exact: true }).fill(customer.password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  return customer;
}

/**
 * Pull the verification link out of the dev-only capture mailbox
 * (server/src/controllers/devController.js) rather than a real inbox — the
 * same approach the plan calls for across every journey that needs a
 * link-in-email (J1 registration, J4/J5 holds needing a verified account,
 * J6 password reset).
 */
async function readVerifyEmailLink(page: Page, email: string): Promise<string> {
  // `notifyVerifyEmail` is deliberately fire-and-forget from
  // `authService.register` (a dead SMTP host must never turn registration
  // into a 500) — so the capture mailbox can, in principle, still be empty
  // for a few milliseconds after the 202 response lands. A short retry loop
  // absorbs that race instead of the test flaking on it.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await page.request.get('/api/dev/last-mail', { params: { email } });
    if (response.ok()) {
      const mail = (await response.json()) as { html: string; text: string };
      return extractVerifyEmailPath(mail, email);
    }
    lastStatus = response.status();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`GET /api/dev/last-mail?email=${email} never returned 200 (last status: ${lastStatus})`);
}

function extractVerifyEmailPath(mail: { html: string; text: string }, email: string): string {
  const match =
    mail.html.match(/href="([^"]*\/verify-email\?token=[^"]+)"/) ??
    mail.text.match(/(\S*\/verify-email\?token=\S+)/);
  if (!match) {
    throw new Error(`Could not find a verify-email link in the captured mail for ${email}: ${JSON.stringify(mail)}`);
  }

  const absoluteUrl = new URL(match[1]);
  return `${absoluteUrl.pathname}${absoluteUrl.search}`;
}
