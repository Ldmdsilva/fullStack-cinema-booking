import Hold from '../models/Hold.js';
import * as paymentService from '../services/paymentService.js';
import { fulfilHold } from '../services/confirmService.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// FR-39 (ADR-014): a customer who pays then closes the tab before their
// confirm call lands must still get their booking. This job is
// hold-driven, not list-driven — it only ever looks at Holds that already
// exist in our own DB (`status: 'active'` with a `paymentIntentId`), so it
// is bounded and deterministic rather than scanning Stripe's full
// PaymentIntent history.
const RECONCILE_INTERVAL_MS = env.RECONCILE_INTERVAL_MINUTES * 60 * 1000;
let intervalHandle = null;

/**
 * Sweep every active, paid-attempt Hold and complete any whose Stripe
 * PaymentIntent has actually succeeded. Uses the exact same `fulfilHold`
 * the HTTP confirm path uses, so a reconciled booking is indistinguishable
 * from one confirmed by the client.
 * @returns {Promise<number>} number of holds fulfilled this sweep
 */
export async function reconcilePendingHolds() {
  const candidates = await Hold.find({ status: 'active', paymentIntentId: { $exists: true, $ne: null } });

  let reconciledCount = 0;
  for (const hold of candidates) {
    try {
      const intent = await paymentService.retrieveIntent(hold.paymentIntentId);
      if (intent.status === 'succeeded') {
        await fulfilHold(hold, intent);
        reconciledCount++;
      }
      // Not yet succeeded — leave it. The sweeper's PAID_HOLD_GRACE_MS grace
      // window (holdReaper.js) gives it more time before release.
    } catch (error) {
      // Never let one bad hold (a thrown ALLOCATION_FAILED, a Stripe
      // retrieval error, etc.) abort the whole sweep.
      logger.error(
        { err: error, holdId: hold._id },
        '[PaymentReconciler] Failed to reconcile a hold — continuing with the next candidate'
      );
    }
  }

  return reconciledCount;
}

/**
 * Start the background sweep that reconciles paid-but-unconfirmed holds
 * every `RECONCILE_INTERVAL_MINUTES` minutes (FR-39). Mirrors `holdReaper.js`'s
 * `startHoldReaper`/`stopHoldReaper` guard/interval pattern exactly.
 * @returns {NodeJS.Timeout}
 */
export function startPaymentReconciler() {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    reconcilePendingHolds().catch((error) =>
      logger.error({ err: error }, '[PaymentReconciler] Sweep failed')
    );
  }, RECONCILE_INTERVAL_MS);
  return intervalHandle;
}

/**
 * Stop the background sweep (graceful shutdown).
 */
export function stopPaymentReconciler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
