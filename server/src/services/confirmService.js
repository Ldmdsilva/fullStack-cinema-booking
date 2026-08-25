import Hold from '../models/Hold.js';
import Booking from '../models/Booking.js';
import Showtime from '../models/Showtime.js';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import * as paymentService from './paymentService.js';
import { generateBookingReference } from './bookingService.js';
import { notifyBookingConfirmed } from './notification/notificationService.js';
import { broadcastShowtimeSeatsUpdated, broadcastBookingConfirmed } from '../sockets/seatSocketGateway.js';

/**
 * §C7.1 / ADR-014 — server-side payment confirmation for the Showtime/Hold
 * domain. This is deliberately additive and parallel to the legacy
 * Event/Booking Checkout-Session + webhook flow in `paymentService.js` /
 * `bookingService.js`, which stays untouched.
 *
 * The core anti-forgery rule (ADR-014, FR-36, R23): the client sends only
 * `{holdId}`. Every payment fact — status, amount, currency, and the hold it
 * was created for — is re-derived from Stripe with the secret key, never
 * trusted from the request body.
 */

const populateOptions = [
  { path: 'userRef', select: 'name email' },
  { path: 'showtimeRef', select: 'screenName startsAt filmRef cinemaRef' },
];

/**
 * Confirm a Hold's payment and, if genuinely paid, fulfil it into a Booking.
 * Idempotent (FR-37): calling this repeatedly for the same hold — whether
 * from a client retry/double-click or a race with the background
 * reconciler — creates at most one Booking.
 * @param {object} params
 * @param {string} params.holdId
 * @param {string} params.userId
 * @returns {Promise<object>} the confirmed (or already-existing) Booking
 */
export async function confirmBooking({ holdId, userId }) {
  const hold = await Hold.findById(holdId);
  if (!hold) {
    throw new AppError('Hold not found', 404, 'HOLD_NOT_FOUND');
  }

  if (hold.userRef.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only confirm your own holds', 403, 'FORBIDDEN');
  }

  // Idempotency short-circuit (FR-37): a Booking already exists for this
  // hold — hand it back with no re-verification and no second Stripe call.
  // This is what makes calling confirm repeatedly for the same hold safe.
  if (hold.status === 'consumed') {
    const existing = await Booking.findOne({ holdRef: hold._id }).populate(populateOptions);
    if (existing) return existing;
    // Extremely unlikely (consumed but no booking row) — fall through and
    // let the caller see a clear error rather than silently proceeding.
    throw new AppError('This hold has already been consumed but no booking could be found', 409, 'HOLD_NOT_FOUND');
  }

  if (hold.status === 'released') {
    throw new AppError('This hold is no longer active', 409, 'HOLD_EXPIRED');
  }

  if (!hold.paymentIntentId) {
    throw new AppError('No payment has been initiated for this hold', 400, 'VALIDATION_ERROR');
  }

  // Retrieve the PaymentIntent directly from Stripe using the secret key —
  // the ADR-014 anti-forgery core. A network/Stripe-side failure here is
  // NOT a verification failure: the hold is retained and reconciliation
  // will complete it once Stripe is reachable again (§D4.3).
  let intent;
  try {
    intent = await paymentService.retrieveIntent(hold.paymentIntentId);
  } catch {
    throw new AppError(
      'Payment provider is temporarily unreachable. Your hold is retained and will be reconciled automatically.',
      503,
      'PAYMENT_PROVIDER_UNAVAILABLE'
    );
  }

  const verificationFailed =
    intent.status !== 'succeeded' ||
    intent.amount !== hold.amountMinor ||
    intent.currency?.toLowerCase() !== hold.currency?.toLowerCase() ||
    intent.metadata?.holdId !== hold._id.toString();

  if (verificationFailed) {
    // Generic outcome on ANY mismatch — a probing client learns nothing
    // about which specific check failed (§C7.1, FR-40a, R23).
    logger.error(
      {
        holdId: hold._id.toString(),
        paymentIntentId: hold.paymentIntentId,
        intentStatus: intent.status,
      },
      '[confirmService] Payment verification failed — possible tampering or desync'
    );
    throw new AppError(
      'Unable to confirm this booking. Please contact support if you believe this is an error.',
      402,
      'PAYMENT_NOT_SUCCEEDED'
    );
  }

  return fulfilHold(hold, intent);
}

/**
 * Fulfil an already-verified, paid Hold into a Booking: allocate its seats
 * (held -> booked), create the Booking, mark the Hold consumed, then notify
 * and broadcast. Shared by the HTTP confirm path above and the background
 * reconciler (`jobs/paymentReconciler.js`) so both drive the exact same
 * allocation/creation/notification logic.
 * @param {object} hold - a Mongoose Hold document, already verified paid
 * @param {object} _intent - the verified Stripe PaymentIntent (currently
 *   unused beyond having already been verified by the caller; accepted for
 *   symmetry with the reconciler's call site and to keep the interface
 *   stable if a future caller needs it)
 * @returns {Promise<object>} the created (or found-on-race) Booking
 */
export async function fulfilHold(hold, _intent) {
  // Atomic allocation: held -> booked, ONLY if the seat is still `held` and
  // still points at THIS hold. This is what makes a duplicate/concurrent
  // fulfil attempt's allocation step a safe no-op rather than a double
  // allocation.
  const allocResult = await Showtime.updateOne(
    { _id: hold.showtimeRef },
    {
      $set: { 'seats.$[elem].status': 'booked' },
      $unset: { 'seats.$[elem].holdExpiresAt': '', 'seats.$[elem].holdRef': '' },
    },
    { arrayFilters: [{ 'elem.holdRef': hold._id, 'elem.status': 'held' }] }
  );

  // FR-40 — allocation failure handling. The customer HAS paid but their
  // seats can no longer be allocated (some other process already touched
  // them). Auto-refund, log a high-severity security/ops event, release the
  // hold, and surface a clear error — the HTTP path lets the customer see
  // it; the reconciler (jobs/paymentReconciler.js) catches it and moves on.
  if (allocResult.modifiedCount === 0) {
    try {
      await paymentService.refund(hold.paymentIntentId);
    } catch (refundError) {
      logger.error(
        { err: refundError, holdId: hold._id.toString(), paymentIntentId: hold.paymentIntentId },
        '[confirmService] Auto-refund failed after allocation failure'
      );
    }
    logger.error(
      { holdId: hold._id.toString(), paymentIntentId: hold.paymentIntentId },
      '[confirmService] ALLOCATION_FAILED — seats could not be allocated after successful payment; auto-refunded'
    );

    hold.status = 'released';
    await hold.save();

    throw new AppError(
      'Your seats could not be allocated and your payment has been refunded. Please try booking again.',
      409,
      'ALLOCATION_FAILED'
    );
  }

  // Re-fetch the showtime post-allocation to source each seat's row/number
  // (Hold.seatSnapshot deliberately omits these — see Hold.js) and the
  // Film/Cinema for the notification shim below.
  const showtime = await Showtime.findById(hold.showtimeRef).populate('filmRef').populate('cinemaRef');
  const liveSeatsById = new Map(showtime.seats.map((seat) => [seat.id, seat]));

  // Combine the hold's FROZEN price/section (must never drift, even if the
  // showtime's live data somehow changed) with the live row/number.
  const fullSeats = hold.seatSnapshot.map((snap) => {
    const liveSeat = liveSeatsById.get(snap.id);
    return {
      id: snap.id,
      section: snap.section,
      row: liveSeat?.row,
      number: liveSeat?.number,
      price: snap.price,
    };
  });

  const bookingFields = {
    userRef: hold.userRef,
    showtimeRef: hold.showtimeRef,
    holdRef: hold._id,
    seats: fullSeats,
    totalPrice: hold.totalPrice,
    status: 'confirmed',
    paymentIntentId: hold.paymentIntentId,
    paymentStatus: 'succeeded',
    screenName: showtime.screenName,
  };

  let booking = await createBookingWithReferenceRetry(bookingFields, hold._id);

  // Mark the hold consumed — guarded (no-op if some other path already
  // consumed it), matching the idempotency backstop above.
  await Hold.updateOne({ _id: hold._id, status: 'active' }, { $set: { status: 'consumed' } });

  // Notifications dispatch AFTER the Booking commit (ADR-012) — this
  // domain has no Event/Venue, so we shim the existing template's expected
  // shape from the Film/Cinema instead of building a dedicated template.
  const film = showtime.filmRef;
  const cinema = showtime.cinemaRef;
  const user = await User.findById(hold.userRef);
  if (user && film && cinema) {
    notifyBookingConfirmed({
      user,
      booking,
      event: { title: film.title, date: showtime.startsAt },
      venue: { name: cinema.name, city: cinema.city },
    });
  }

  // Broadcast, also after commit.
  broadcastShowtimeSeatsUpdated(hold.showtimeRef.toString(), hold.seatIds, 'booked');
  broadcastBookingConfirmed(hold.userRef.toString(), {
    holdId: hold._id.toString(),
    bookingId: booking._id.toString(),
    reference: booking.reference,
  });

  return booking;
}

/**
 * Create a Booking with the same reference-collision retry pattern
 * `bookingService.createBooking` uses, PLUS a duplicate-key-tolerant create
 * that treats a `holdRef`/`paymentIntentId` collision as the idempotency
 * backstop (FR-37) at work rather than an error: a concurrent caller (a
 * racing confirm call, or the reconciler racing the HTTP request) already
 * created this exact booking.
 * @param {object} fields - fields for `Booking.create`, minus `reference`
 * @param {import('mongoose').Types.ObjectId} holdId
 * @returns {Promise<object>}
 */
async function createBookingWithReferenceRetry(fields, holdId) {
  let reference = generateBookingReference();
  try {
    return await Booking.create({ reference, ...fields });
  } catch (err) {
    if (err.code !== 11000) throw err;

    const dupField = Object.keys(err.keyValue || {})[0];
    if (dupField !== 'reference') {
      // holdRef or paymentIntentId collided — someone else already created
      // this exact booking. Hand back the same one; do not create a dupe.
      const existing = await Booking.findOne({ holdRef: holdId });
      if (existing) return existing;
      throw err; // truly unexpected — shouldn't happen
    }

    // Rare reference collision — regenerate and retry once (mirrors
    // bookingService.createBooking's existing pattern).
    reference = `${generateBookingReference()}-${Math.floor(Math.random() * 100)}`;
    try {
      return await Booking.create({ reference, ...fields });
    } catch (err2) {
      if (err2.code === 11000) {
        const existing = await Booking.findOne({ holdRef: holdId });
        if (existing) return existing;
      }
      throw err2;
    }
  }
}

/**
 * Look up a Booking by the Hold it came from — used by
 * `GET /api/bookings/by-hold/:holdId` so a client whose confirm call never
 * arrived (abandoned tab) can poll for the reconciliation job to complete
 * it. A missing booking means "still reconciling, not yet confirmed" (404),
 * not an error condition.
 * @param {string} holdId
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Promise<object>}
 */
export async function getBookingByHold(holdId, { userId, role }) {
  const booking = await Booking.findOne({ holdRef: holdId }).populate(populateOptions);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (role !== 'admin' && booking.userRef?._id?.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only view your own bookings', 403, 'FORBIDDEN');
  }

  return booking;
}
