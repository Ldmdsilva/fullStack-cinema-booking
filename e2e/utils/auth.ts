import { expect, type Page } from '@playwright/test';

/**
 * Drives the real LoginPage form (client/src/pages/LoginPage.tsx) — same
 * component for both /login and /register, switched by a tab. Used instead
 * of poking localStorage directly so the login/register journey itself is
 * exercised, not just assumed.
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  // /login defaults to the "signin" tab already (LoginPage reads the path),
  // so no tab click is needed. The tab switcher button and the form's
  // submit button both read "Sign in", so scope to the <form> to avoid a
  // Playwright strict-mode ambiguity between the two.
  const form = page.locator('form');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  // A successful sign-in always navigates away from /login (to `from` or
  // /bookings) — wait for that rather than a toast, since there isn't one.
  await expect(page).not.toHaveURL(/\/login$/);
}

export interface NewCustomer {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** A fresh, collision-free customer for register-journey tests. */
export function buildNewCustomer(): NewCustomer {
  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    name: 'E2E Test Customer',
    email: `e2e.customer.${unique}@example.test`,
    // PHONE_RE on LoginPage wants a Sri Lankan mobile shape: 0|+94|94 then 7XXXXXXXX.
    phone: `07${unique.slice(-8).padStart(8, '1')}`,
    password: 'Password123!',
  };
}

/** Drives the real register form and lands the new user as signed in. */
export async function registerAs(page: Page, customer: NewCustomer) {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Full name').fill(customer.name);
  await page.getByLabel('Email').fill(customer.email);
  await page.getByLabel('Mobile number').fill(customer.phone);
  await page.getByLabel('Password', { exact: true }).fill(customer.password);
  await page.getByLabel('Confirm password').fill(customer.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).not.toHaveURL(/\/register$/);
}
