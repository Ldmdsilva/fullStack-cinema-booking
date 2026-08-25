import Hold from '../models/Hold.js';
import Showtime from '../models/Showtime.js';
import { broadcastShowtimeSeatsUpdated } from '../sockets/seatSocketGateway.js';
import { cancelIntent } from '../services/paymentService.js';
import { logger } from '../config/logger.js';

const REAP_INTERVAL_MS = 60 * 1000;
let intervalHandle = null;

/**
 * Start the background sweep that releases expired holds every 60s.
 * @returns {NodeJS.Timeout}
 */
export function startHoldReaper() {
  if (intervalHandle) return intervalHandle;
  intervalHandle = setInterval(() => {
    reapAllExpiredHolds().catch((error) => logger.error({ err: error }, '[HoldReaper] Sweep failed'));
  }, REAP_INTERVAL_MS);
  return intervalHandle;
}

/**
 * Stop the background sweep (graceful shutdown).
 */
export function stopHoldReaper() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// A hold with a payment attempt (`paymentIntentId` set) gets this much
// extra time past its plain `expiresAt` before the sweeper releases its
// seats — longer than the reconciliation job's 2-minute interval (FR-39),
// so a paid-but-unconfirmed hold survives long enough for that job to catch
// it before this sweeper releases the seats out from under it.
const PAID_HOLD_GRACE_MS = 5 * 60 * 1000;

/**
 * Release a Hold's claimed seats back to `available`, keyed on `holdRef` —
 * NOT seat id. This is a deliberate correctness fix: releasing by seat id
 * alone risks stealing back a seat that has since been re-held by a
 * DIFFERENT hold (e.g. this hold expired, the sweeper already reaped it,
 * someone else grabbed the seat, and then this stale release call fires
 * late). Keying on `holdRef` guarantees this call only ever touches seats
 * that still literally point at THIS hold's id.
 *
 * Exported so `holdService.js` (customer-initiated release) can reuse this
 * exact query instead of duplicating the arrayFilters shape.
 * @param {object} hold
 */
export async function releaseSeatsForHold(hold) {
  await Showtime.updateOne(
    { _id: hold.showtimeRef },
    {
      $set: { 'seats.$[elem].status': 'available' },
      $unset: { 'seats.$[elem].holdExpiresAt': '', 'seats.$[elem].holdRef': '' },
    },
    { arrayFilters: [{ 'elem.holdRef': hold._id }] }
  );
}

/**
 * Release one expired Hold: active -> released, its seats freed (keyed on
 * holdRef), any live PaymentIntent cancelled, and a broadcast fired.
 * Guarded by a conditional update so a concurrent consume/release can't be
 * undone by the sweeper.
 * @param {object} hold
 */
async function releaseExpiredHold(hold) {
  const updated = await Hold.findOneAndUpdate(
    { _id: hold._id, status: 'active' },
    { $set: { status: 'released' } },
    { returnDocument: 'after' }
  );
  if (!updated) return; // raced by a concurrent consume/release — nothing to do

  await releaseSeatsForHold(hold);

  if (hold.paymentIntentId) {
    try {
      await cancelIntent(hold.paymentIntentId);
    } catch (error) {
      logger.error(
        { err: error, holdId: hold._id.toString() },
        '[HoldReaper] Failed to cancel PaymentIntent for expired hold'
      );
    }
  }

  broadcastShowtimeSeatsUpdated(hold.showtimeRef.toString(), hold.seatIds, 'available');
}

/**
 * Build the "expired hold" query shared by the per-showtime and global
 * sweeps: an unpaid hold (no `paymentIntentId`) is expired the instant its
 * plain `expiresAt` passes; a hold with a payment attempt gets an extra
 * `PAID_HOLD_GRACE_MS` grace window first, giving the reconciliation job a
 * chance to confirm it before this sweeper releases the seats.
 * @param {string} [showtimeId]
 * @returns {object} a Mongo filter for `Hold.find`
 */
function buildExpiredHoldFilter(showtimeId) {
  const now = new Date();
  const filter = {
    status: 'active',
    $or: [
      { paymentIntentId: { $exists: false }, expiresAt: { $lt: now } },
      {
        paymentIntentId: { $exists: true },
        expiresAt: { $lt: new Date(now.getTime() - PAID_HOLD_GRACE_MS) },
      },
    ],
  };
  if (showtimeId) filter.showtimeRef = showtimeId;
  return filter;
}

/**
 * Release every expired Hold for a single showtime. This is what
 * `holdService.createHold` calls to pre-reap before attempting a new hold,
 * so a stale hold can never block a legitimate new one.
 * @param {string} showtimeId
 * @returns {Promise<number>} number of holds released
 */
export async function reapExpiredHoldsForShowtime(showtimeId) {
  const expiredHolds = await Hold.find(buildExpiredHoldFilter(showtimeId));
  for (const hold of expiredHolds) {
    await releaseExpiredHold(hold);
  }
  return expiredHolds.length;
}

/**
 * Release every expired Hold across all showtimes — the periodic sweep
 * counterpart to `reapExpiredHoldsForShowtime`.
 * @returns {Promise<number>} number of holds released
 */
export async function reapAllExpiredHolds() {
  const expiredHolds = await Hold.find(buildExpiredHoldFilter());
  for (const hold of expiredHolds) {
    await releaseExpiredHold(hold);
  }
  return expiredHolds.length;
}
