import mongoose from 'mongoose';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import Hold from '../models/Hold.js';
import Showtime from '../models/Showtime.js';
import { AppError } from '../middleware/errorHandler.js';
import { computeSeatTotal } from './pricingService.js';
import * as paymentService from './paymentService.js';
import { broadcastShowtimeSeatsUpdated } from '../sockets/seatSocketGateway.js';
import { reapExpiredHoldsForShowtime, releaseSeatsForHold } from '../jobs/holdReaper.js';

/**
 * Create a Hold on a set of seats for a Showtime, using the exact atomic
 * conditional-update technique `bookingService.createBooking` uses for the
 * legacy Event/Booking flow (ADR-004/ADR-012), adapted so a hold — not a
 * booking — is what results, and so a Stripe call never happens here (D12).
 *
 * Correctness-critical: this is the mechanism that guarantees zero
 * double-bookings under concurrency (O7, §D4.3(a)). The `Showtime.updateOne`
 * below only matches (and therefore only modifies) a document where every
 * requested seat is *still* `available` at the instant MongoDB evaluates the
 * filter — so of N simultaneous callers targeting an overlapping seat set,
 * at most one's update can ever report `modifiedCount > 0`.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.showtimeId
 * @param {string[]} params.seatIds
 * @param {number} [params.ttlMs] - test-only TTL override in milliseconds,
 *   in place of `env.HOLD_TTL_MINUTES`. Only ever populated by
 *   `holdController.createHold` from a request header it reads itself
 *   ONLY when `NODE_ENV !== 'production'` (§D4.4 journey J5/"hold expiry" —
 *   waiting out a real 10-minute default TTL in an e2e run is impractical).
 *   Never derived from the request body (`createHoldSchema` is `.strict()`
 *   on purpose) and never available in production regardless of what a
 *   caller sends.
 * @returns {Promise<object>} the created Hold document
 */
export async function createHold({ userId, showtimeId, seatIds, ttlMs }) {
  if (!showtimeId || !Array.isArray(seatIds) || seatIds.length === 0) {
    throw new AppError(
      'showtimeId and a non-empty array of seatIds are required',
      400,
      'VALIDATION_ERROR'
    );
  }

  // Deduplicate seat IDs to prevent duplicate counts (mirrors
  // bookingService.createBooking's uniqueSeatIds pattern).
  const uniqueSeatIds = [...new Set(seatIds.map((id) => String(id).trim()))];

  // 1. Pre-reap this showtime's own expired holds first, so a stale hold
  // can never block a legitimate new one.
  await reapExpiredHoldsForShowtime(showtimeId);

  // 2. Fetch the showtime to verify existence/state and to source the
  // pre-update seat snapshot (price/section never change; only status does).
  const showtime = await Showtime.findById(showtimeId);
  if (!showtime) {
    throw new AppError('Showtime not found', 404, 'SHOWTIME_NOT_FOUND');
  }

  if (showtime.status !== 'scheduled') {
    throw new AppError('This showtime is no longer active for booking', 400, 'SHOWTIME_CANCELLED');
  }

  if (showtime.startsAt <= new Date()) {
    throw new AppError('This showtime has already started', 400, 'SHOWTIME_STARTED');
  }

  // 3. Every requested seat id must exist on this showtime.
  const showtimeSeatMap = new Map(showtime.seats.map((seat) => [seat.id, seat]));
  const missingSeats = uniqueSeatIds.filter((id) => !showtimeSeatMap.has(id));
  if (missingSeats.length > 0) {
    throw new AppError(
      'One or more requested seats were not found on this showtime',
      400,
      'SEAT_NOT_FOUND',
      { missingSeats }
    );
  }

  // 4. Compute total price server-side from stored (frozen) seat prices —
  // never trust a client-supplied amount (there isn't one in this
  // endpoint's request body at all; `createHoldSchema` is `.strict()`).
  const { totalPrice, currency } = computeSeatTotal(showtime, uniqueSeatIds);

  const effectiveTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : env.HOLD_TTL_MINUTES * 60 * 1000;
  const holdExpiresAt = new Date(Date.now() + effectiveTtlMs);

  // 5. Pre-generate the Hold's _id before the atomic update: the update
  // needs to write this id into the showtime seats' `holdRef` field in the
  // SAME operation that flips their status, but the Hold document itself
  // can only be safely created AFTER that update succeeds — otherwise a
  // failed seat claim would leave an orphaned Hold row behind.
  const preGeneratedHoldId = new mongoose.Types.ObjectId();

  // 6. ATOMIC CONDITIONAL UPDATE (ADR-004/ADR-012): available -> held.
  // Matches the showtime only if ALL requested seats are currently
  // 'available'; MongoDB evaluates this filter+update as a single atomic
  // document operation, so concurrent callers can never both succeed.
  const updateResult = await Showtime.updateOne(
    {
      _id: showtimeId,
      status: 'scheduled',
      seats: { $all: uniqueSeatIds.map((id) => ({ $elemMatch: { id, status: 'available' } })) },
    },
    {
      $set: {
        'seats.$[elem].status': 'held',
        'seats.$[elem].holdExpiresAt': holdExpiresAt,
        'seats.$[elem].holdRef': preGeneratedHoldId,
      },
    },
    { arrayFilters: [{ 'elem.id': { $in: uniqueSeatIds } }] }
  );

  if (updateResult.matchedCount === 0 || updateResult.modifiedCount === 0) {
    throw new AppError(
      'One or more selected seats are no longer available.',
      409,
      'SEAT_UNAVAILABLE',
      { seatIds: uniqueSeatIds }
    );
  }

  // 7. Only now build the seat snapshot (from the PRE-update showtime doc —
  // price/section don't change, only status does) and create the Hold.
  const seatSnapshot = uniqueSeatIds.map((id) => {
    const seat = showtimeSeatMap.get(id);
    return { id: seat.id, section: seat.section, price: seat.price };
  });

  let hold;
  try {
    hold = await Hold.create({
      _id: preGeneratedHoldId,
      userRef: userId,
      showtimeRef: showtimeId,
      seatIds: uniqueSeatIds,
      seatSnapshot,
      totalPrice,
      // `pricingService.computeSeatTotal` sums each seat's stored `price`,
      // which is frozen via `tierPrice()` — a function that already
      // operates on minor currency units (see config/seatTiers.js). So
      // `totalPrice` IS already minor units; no conversion is needed here.
      amountMinor: totalPrice,
      currency,
      status: 'active',
      expiresAt: holdExpiresAt,
    });
  } catch (error) {
    // 8. Roll back the seat claim if Hold creation itself fails (e.g. a
    // duplicate _id collision or a validation error) — a failed Hold write
    // must never strand seats as permanently 'held' with no owning Hold.
    await Showtime.updateOne(
      { _id: showtimeId },
      {
        $set: { 'seats.$[elem].status': 'available' },
        $unset: { 'seats.$[elem].holdExpiresAt': '', 'seats.$[elem].holdRef': '' },
      },
      { arrayFilters: [{ 'elem.id': { $in: uniqueSeatIds } }] }
    );
    throw error;
  }

  // 9. Broadcast only after the Hold document is durably created (mirrors
  // the existing pattern of "broadcast only after the write commits", §C7.2).
  broadcastShowtimeSeatsUpdated(showtimeId, uniqueSeatIds, 'held');

  return hold;
}

/**
 * Get a single hold by id, scoped to its owner unless the caller is an admin.
 * @param {string} id
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Promise<object>}
 */
export async function getHoldById(id, { userId, role }) {
  const hold = await Hold.findById(id);
  if (!hold) {
    throw new AppError('Hold not found', 404, 'HOLD_NOT_FOUND');
  }

  if (role !== 'admin' && hold.userRef.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only view your own holds', 403, 'FORBIDDEN');
  }

  return hold;
}

/**
 * Create (or, on retry, re-retrieve) a Stripe PaymentIntent for an existing
 * active Hold (D12) — a distinct follow-up call from hold creation, so a
 * hold can exist and broadcast in realtime without ever touching Stripe.
 * @param {object} params
 * @param {string} params.holdId
 * @param {string} params.userId
 * @returns {Promise<{ clientSecret: string, publishableKey: string, expiresAt: Date, amount: number }>}
 */
export async function createPaymentIntentForHold({ holdId, userId }) {
  const hold = await Hold.findById(holdId);
  if (!hold) {
    throw new AppError('Hold not found', 404, 'HOLD_NOT_FOUND');
  }

  if (hold.userRef.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only pay for your own holds', 403, 'FORBIDDEN');
  }

  // Defensive read-time check (same FR-31 philosophy as
  // `effectiveSeatStatus`): an expired-but-not-yet-swept hold must never be
  // payable. Actually releasing it is the sweeper's job (holdReaper.js), not
  // this read.
  if (hold.status !== 'active' || hold.expiresAt <= new Date()) {
    throw new AppError('This hold is no longer active', 409, 'HOLD_EXPIRED');
  }

  if (hold.paymentIntentId) {
    // Idempotent retry/reload (e.g. the customer refreshed checkout): the
    // unique index on `Hold.paymentIntentId` means a second `create` call
    // for the same hold would fail anyway, so re-retrieve the existing
    // intent's client secret instead of creating a new one.
    // `paymentService` doesn't yet expose a `retrieveIntent` adapter method
    // (a later ADR-014 phase owns that adapter's full shape) so this reads
    // Stripe directly for this one-off case.
    const intent = await stripe.paymentIntents.retrieve(hold.paymentIntentId);
    return {
      clientSecret: intent.client_secret,
      publishableKey: env.STRIPE_PUBLISHABLE_KEY,
      expiresAt: hold.expiresAt,
      amount: hold.amountMinor,
    };
  }

  const intent = await paymentService.createIntent({
    holdId: hold._id.toString(),
    amountMinor: hold.amountMinor,
    currency: hold.currency,
  });

  hold.paymentIntentId = intent.id;
  await hold.save();

  return {
    clientSecret: intent.client_secret,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    expiresAt: hold.expiresAt,
    amount: hold.amountMinor,
  };
}

/**
 * Release an active Hold before payment/expiry (customer-initiated cancel).
 * Idempotent: releasing an already-released/consumed hold is a no-op that
 * returns the hold's current state rather than erroring (DELETE semantics).
 * @param {object} params
 * @param {string} params.holdId
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Promise<object>} the hold, current as of this call
 */
export async function releaseHold({ holdId, userId, role }) {
  const hold = await Hold.findById(holdId);
  if (!hold) {
    throw new AppError('Hold not found', 404, 'HOLD_NOT_FOUND');
  }

  if (role !== 'admin' && hold.userRef.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only release your own holds', 403, 'FORBIDDEN');
  }

  if (hold.status !== 'active') {
    return hold; // already released/consumed — idempotent no-op
  }

  // Guarded conditional update so a concurrent consume-via-confirm (a later
  // phase's job) can't be undone by a release racing it.
  let updated = await Hold.findOneAndUpdate(
    { _id: hold._id, status: 'active' },
    { $set: { status: 'released' } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    // Raced by a concurrent consume/release — return current state rather
    // than erroring.
    return Hold.findById(hold._id);
  }

  // Key the seat release on `holdRef`, NOT seat id (see holdReaper.js's
  // `releaseSeatsForHold` doc comment for why this matters).
  await releaseSeatsForHold(updated);

  if (updated.paymentIntentId) {
    try {
      await paymentService.cancelIntent(updated.paymentIntentId);
    } catch (error) {
      // A released hold must never leave a payable intent behind, but a
      // Stripe-side failure here shouldn't block the release itself.
      logger.error(
        { err: error, holdId: updated._id.toString() },
        '[holdService] Failed to cancel PaymentIntent for released hold'
      );
    }
  }

  broadcastShowtimeSeatsUpdated(updated.showtimeRef.toString(), updated.seatIds, 'available');

  return updated;
}
