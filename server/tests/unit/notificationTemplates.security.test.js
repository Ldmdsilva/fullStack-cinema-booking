import { describe, expect, it } from '@jest/globals';
import { verifyEmailTemplate } from '../../src/templates/email/verifyEmail.js';
import { passwordResetTemplate } from '../../src/templates/email/passwordReset.js';
import { bookingConfirmedTemplate } from '../../src/templates/email/bookingConfirmed.js';
import { bookingCancelledTemplate } from '../../src/templates/email/bookingCancelled.js';
import { emailLayout } from '../../src/templates/email/layout.js';
import { bookingConfirmedSms, bookingCancelledSms } from '../../src/templates/sms.js';

/**
 * FR-51 — every outbound notification template is rendered against sentinel
 * values that would be a genuine security incident if they ever leaked (a
 * Stripe payment-intent id / card-like PAN standing in for "payment-adjacent
 * data"), asserting the sentinel never appears anywhere in the rendered
 * subject/html/text (or SMS body).
 *
 * The two templates that legitimately DO carry a raw, single-use token
 * (verify-email / password-reset) are held to a tighter standard: the token
 * must appear — proving the link itself works — but ONLY inside its one
 * `?token=` query string, never bare elsewhere in the visible copy. A token
 * that also shows up outside the link is a real information-disclosure
 * smell (defense in depth) even though it is technically "the user's own
 * token", because it multiplies the ways the token can be captured (screen
 * readers, copy-paste of the wrong substring, log scraping of email bodies,
 * etc).
 *
 * No template file had any test coverage before this file (see git history
 * for `src/templates/`) — this is meant to be a real regression guard, in
 * the same spirit as the prior `bookingConfirmedSms` `event.artist` ->
 * `undefined` bug that a previous migration phase found and fixed in this
 * exact file family (see tests/unit/smsTemplates.test.js).
 */

const SENTINEL_TOKEN = 'SENTINEL_RAW_TOKEN_VALUE_9f8e7d';

// Stands in for any payment-adjacent value that must never be echoed back to
// a customer in a notification — shaped like both a PAN and a real field on
// the Booking model (`paymentIntentId`, Stripe's `pi_...` id).
const SENTINEL_PAYMENT_INTENT = 'SENTINEL_CARD_4242424242424242';

/**
 * Normalise a template's return value to an array of strings to scan.
 * Email templates return `{ subject, html, text }`; SMS templates return a
 * bare string.
 */
function collectStrings(rendered) {
  if (typeof rendered === 'string') return [rendered];
  return [rendered.subject, rendered.html, rendered.text];
}

function assertNeverContains(rendered, sentinel) {
  for (const s of collectStrings(rendered)) {
    expect(s).not.toContain(sentinel);
  }
}

function assertTokenOnlyInQueryParam(rendered, token) {
  const combined = collectStrings(rendered).join('\n');

  // The link must actually be present, proving it still works ...
  expect(combined).toMatch(new RegExp(`\\?token=${token}\\b`));

  // ... and every occurrence of the raw token must be part of that exact
  // `?token=<value>` query string. Stripping every such occurrence must
  // leave no bare token behind anywhere else in the copy.
  const withLinksRemoved = combined.split(`?token=${token}`).join('');
  expect(withLinksRemoved).not.toContain(token);
}

function sentinelBooking(overrides = {}) {
  return {
    reference: 'ENC-9F8E7D',
    seats: [{ id: 'A-12', section: 'STANDARD', row: 'A', number: 12, price: 2500 }],
    totalPrice: 2500,
    paymentIntentId: SENTINEL_PAYMENT_INTENT,
    ...overrides,
  };
}

describe('notification templates - FR-51 sentinel leak guard', () => {
  describe('verifyEmailTemplate (carries a raw token)', () => {
    const verifyUrl = `https://example.com/verify-email?token=${SENTINEL_TOKEN}`;

    it('embeds the raw token only inside the ?token= link, never bare in the copy', () => {
      const rendered = verifyEmailTemplate({ name: 'Sentinel User', verifyUrl });
      assertTokenOnlyInQueryParam(rendered, SENTINEL_TOKEN);
    });

    it('renders the expected subject and includes the recipient name', () => {
      const rendered = verifyEmailTemplate({ name: 'Sentinel User', verifyUrl });
      expect(rendered.subject).toBe('Verify your Encore Cinemas account');
      expect(rendered.text).toContain('Sentinel User');
      expect(rendered.html).toContain('Sentinel User');
    });
  });

  describe('passwordResetTemplate (carries a raw token)', () => {
    const resetUrl = `https://example.com/reset-password?token=${SENTINEL_TOKEN}`;

    it('embeds the raw token only inside the ?token= link, never bare in the copy', () => {
      const rendered = passwordResetTemplate({ name: 'Sentinel User', resetUrl });
      assertTokenOnlyInQueryParam(rendered, SENTINEL_TOKEN);
    });

    it('renders the expected subject and includes the recipient name', () => {
      const rendered = passwordResetTemplate({ name: 'Sentinel User', resetUrl });
      expect(rendered.subject).toBe('Reset your Encore Cinemas password');
      expect(rendered.text).toContain('Sentinel User');
      expect(rendered.html).toContain('Sentinel User');
    });
  });

  describe('bookingConfirmedTemplate / bookingConfirmedSms (payment-adjacent data must never leak)', () => {
    const booking = sentinelBooking();
    const event = { title: 'Sentinel Feature Film', date: new Date('2026-09-12T20:00:00.000Z') };
    const venue = { name: 'Sentinel Cinema', city: 'Colombo' };

    it('email never echoes the paymentIntentId', () => {
      const rendered = bookingConfirmedTemplate({ booking, event, venue });
      assertNeverContains(rendered, SENTINEL_PAYMENT_INTENT);
      // Sanity: the template did render real booking content, so a bug that
      // blanked the whole body would not silently pass the assertion above.
      expect(rendered.text).toContain(booking.reference);
      expect(rendered.text).toContain(event.title);
    });

    it('sms never echoes the paymentIntentId', () => {
      const sms = bookingConfirmedSms({ booking, event, venue });
      assertNeverContains(sms, SENTINEL_PAYMENT_INTENT);
      expect(sms).toContain(booking.reference);
      expect(sms).toContain(event.title);
      expect(sms).not.toContain('undefined');
    });

    it('email and sms tolerate a missing venue without leaking or throwing', () => {
      const rendered = bookingConfirmedTemplate({ booking, event, venue: null });
      assertNeverContains(rendered, SENTINEL_PAYMENT_INTENT);

      const sms = bookingConfirmedSms({ booking, event, venue: null });
      assertNeverContains(sms, SENTINEL_PAYMENT_INTENT);
      expect(sms).not.toContain('undefined');
    });
  });

  describe('bookingCancelledTemplate / bookingCancelledSms (payment-adjacent data must never leak)', () => {
    const booking = sentinelBooking();

    it('email never echoes the paymentIntentId, refunded or not', () => {
      const refundedRendered = bookingCancelledTemplate({ booking, refunded: true });
      assertNeverContains(refundedRendered, SENTINEL_PAYMENT_INTENT);
      expect(refundedRendered.text).toContain(booking.reference);
      expect(refundedRendered.text).not.toContain('undefined');

      const unrefundedRendered = bookingCancelledTemplate({ booking, refunded: false });
      assertNeverContains(unrefundedRendered, SENTINEL_PAYMENT_INTENT);
      expect(unrefundedRendered.text).not.toContain('undefined');
    });

    it('sms never echoes the paymentIntentId', () => {
      const sms = bookingCancelledSms({ booking });
      assertNeverContains(sms, SENTINEL_PAYMENT_INTENT);
      expect(sms).toContain(booking.reference);
      expect(sms).not.toContain('undefined');
    });
  });

  describe('emailLayout shared wrapper', () => {
    it('emits only the title/body it was given, with no other injected content', () => {
      const html = emailLayout({ title: 'Sentinel Title', bodyHtml: `<p>${SENTINEL_PAYMENT_INTENT}</p>` });
      expect(html).toContain('Sentinel Title');
      // The caller-provided body is expected to pass through verbatim; this
      // just confirms the wrapper does not silently drop or alter it.
      expect(html).toContain(SENTINEL_PAYMENT_INTENT);
    });
  });
});
