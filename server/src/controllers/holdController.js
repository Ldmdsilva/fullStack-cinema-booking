import * as holdService from '../services/holdService.js';
import { env } from '../config/env.js';

/**
 * POST /api/holds (§C7.1). Creates the Hold only — no Stripe call (D12).
 * Response shape matches the SRS contract exactly: `{holdId, expiresAt,
 * amountMinor, currency}`.
 */
export async function createHold(req, res, next) {
  try {
    const { showtimeId, seatIds } = req.body;

    // Test-only escape hatch for the e2e hold-expiry journey (SRS §D4.4 J5):
    // waiting out the real `HOLD_TTL_MINUTES` (10 min default) in a browser
    // test is impractical, and the sweeper's own 60s cadence would make the
    // "live read-through before the sweeper runs" assertion the journey
    // exists to prove impossible to observe reliably. Rides on a header
    // instead of the request body, since `createHoldSchema` is deliberately
    // `.strict()` (no client-supplied field belongs in that contract) — and
    // is only ever honoured outside production, so it can never affect a
    // real deployment no matter what a caller sends.
    let ttlMs;
    if (env.NODE_ENV !== 'production') {
      const requested = Number(req.get('X-E2E-Hold-Ttl-Ms'));
      if (Number.isFinite(requested) && requested > 0) ttlMs = requested;
    }

    const hold = await holdService.createHold({ userId: req.user.id, showtimeId, seatIds, ttlMs });
    return res.status(201).json({
      holdId: hold._id.toString(),
      expiresAt: hold.expiresAt,
      amountMinor: hold.amountMinor,
      currency: hold.currency,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/holds/:id. Not itself part of §C7.1's documented table, but
 * needed for a client to reload/reconcile an in-progress hold (e.g. after a
 * page refresh) without re-deriving state purely from sockets.
 */
export async function getHold(req, res, next) {
  try {
    const hold = await holdService.getHoldById(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json({
      holdId: hold._id.toString(),
      showtimeId: hold.showtimeRef.toString(),
      seatIds: hold.seatIds,
      seatSnapshot: hold.seatSnapshot,
      totalPrice: hold.totalPrice,
      amountMinor: hold.amountMinor,
      currency: hold.currency,
      status: hold.status,
      expiresAt: hold.expiresAt,
      paymentIntentId: hold.paymentIntentId || null,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/holds/:id/payment-intent (§C7.1, D12). Creates (or, on retry,
 * re-retrieves) the Stripe PaymentIntent for an existing hold — a distinct
 * follow-up call from hold creation.
 */
export async function createPaymentIntentForHold(req, res, next) {
  try {
    const result = await holdService.createPaymentIntentForHold({
      holdId: req.params.id,
      userId: req.user.id,
    });
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/holds/:id (§C7.1). Releases the hold's seats; 204 with no
 * body, matching the SRS contract exactly. Idempotent.
 */
export async function releaseHold(req, res, next) {
  try {
    await holdService.releaseHold({
      holdId: req.params.id,
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}
