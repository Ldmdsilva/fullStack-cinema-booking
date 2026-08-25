import { stripe } from '../config/stripe.js';

/**
 * §C7.3 / ADR-014 — the Stripe adapter module. No Checkout Sessions, no
 * webhooks: payment status is always obtained by the server calling Stripe
 * directly with its secret key (`retrieveIntent`), never trusted from a
 * client claim or an inbound webhook payload. See `confirmService.js` for
 * the verification logic that consumes this adapter.
 */

/**
 * Convert a major-unit LKR amount (e.g. 6500.00) into the integer minor-unit
 * form Stripe expects for a two-decimal currency.
 * @param {number} amount
 * @returns {number}
 */
export function toMinorUnits(amount) {
  return Math.round(amount * 100);
}

/**
 * Create a Stripe PaymentIntent for a Hold (ADR-014 / D12 — separate from
 * hold creation itself, so a hold can exist and broadcast in realtime
 * without ever touching Stripe, letting non-payment e2e tests run without
 * Stripe keys).
 * @param {{ holdId: string, amountMinor: number, currency: string }} params
 * @returns {Promise<import('stripe').Stripe.PaymentIntent>}
 */
export async function createIntent({ holdId, amountMinor, currency }) {
  return stripe.paymentIntents.create(
    {
      amount: amountMinor,
      currency,
      metadata: { holdId },
      automatic_payment_methods: { enabled: true },
    },
    { idempotencyKey: holdId }
  );
}

/**
 * Cancel a Stripe PaymentIntent (used when a hold is released before
 * payment completes, so a released hold never leaves a payable intent
 * behind). Safe to call on an intent that's already in a terminal state —
 * Stripe's own idempotent-cancel semantics mean this rarely throws, but a
 * caller should still tolerate a failure here without blocking hold release.
 * @param {string} paymentIntentId
 */
export async function cancelIntent(paymentIntentId) {
  return stripe.paymentIntents.cancel(paymentIntentId);
}

/**
 * Retrieve a PaymentIntent's current state directly from Stripe — the
 * server-side source of truth the confirm/reconcile flow uses instead of
 * trusting a client-supplied status (ADR-014).
 * @param {string} paymentIntentId
 * @returns {Promise<import('stripe').Stripe.PaymentIntent>}
 */
export async function retrieveIntent(paymentIntentId) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Refund a captured payment by its PaymentIntent id.
 * @param {string} paymentIntentId
 */
export async function refundPayment(paymentIntentId) {
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}

// §C7.3 names the adapter method `refund` — a direct alias (zero behaviour
// change) so confirm/reconcile/cancellation call sites can call
// `paymentService.refund(...)` matching the ADR-014 interface naming
// exactly, without renaming the existing `refundPayment` export other call
// sites already depend on.
export const refund = refundPayment;

/**
 * List PaymentIntents that succeeded at or after a given time — informational
 * §C7.3 adapter completeness, e.g. for admin/ops visibility; the actual
 * reconciliation job (`jobs/paymentReconciler.js`) is hold-driven, not
 * list-driven.
 * @param {Date|number} sinceDate - a Date or epoch-seconds number
 * @returns {Promise<import('stripe').Stripe.PaymentIntent[]>}
 */
export async function listSucceededSince(sinceDate) {
  const createdGte = typeof sinceDate === 'number' ? sinceDate : Math.floor(new Date(sinceDate).getTime() / 1000);
  const result = await stripe.paymentIntents.list({ created: { gte: createdGte }, limit: 100 });
  return result.data.filter((pi) => pi.status === 'succeeded');
}
