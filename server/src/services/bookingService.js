import Showtime from '../models/Showtime.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { broadcastShowtimeSeatsUpdated } from '../sockets/seatSocketGateway.js';
import { refundPayment } from './paymentService.js';
import { notifyBookingCancelled } from './notification/notificationService.js';

/**
 * Generate a unique, human-readable booking reference code (e.g., ENC-4471)
 *
 * Exported (P5, additive, zero behaviour change) so `confirmService.js`'s
 * Showtime/Hold-domain `fulfilHold` can reuse the exact same reference
 * format instead of duplicating this logic.
 * @returns {string}
 */
export function generateBookingReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const timestampPart = Date.now().toString().slice(-4);
  return `ENC-${randomPart}${timestampPart}`;
}

/**
 * Cancel an existing booking (FR-19, FR-29). A confirmed booking is
 * refunded via Stripe *before* its status flips, so a refund failure
 * cannot leave a "cancelled but unrefunded" booking. A confirmed booking's
 * seats are exclusively its own by this point (the originating hold's
 * `holdRef`/`holdExpiresAt` were already cleared when `confirmService.
 * fulfilHold` allocated them to `'booked'`), so a plain seat-id-keyed
 * release back to 'available' is correct and safe here.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.bookingId
 * @param {string} params.role
 * @returns {Promise<object>}
 */
export async function cancelBooking({ userId, bookingId, role }) {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  // Verify ownership unless admin (FR-19, NFR-3)
  if (role !== 'admin' && booking.userRef.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only cancel your own bookings', 403, 'FORBIDDEN');
  }

  if (booking.status === 'cancelled') {
    return booking;
  }

  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw new AppError('This booking can no longer be cancelled', 400, 'BOOKING_NOT_CANCELLABLE');
  }

  const showtime = await Showtime.findById(booking.showtimeRef);
  if (showtime && showtime.startsAt <= new Date()) {
    throw new AppError(
      'This showtime has already started and can no longer be cancelled',
      400,
      'SHOWTIME_STARTED'
    );
  }

  const wasConfirmed = booking.status === 'confirmed';
  let refunded = false;

  if (wasConfirmed && booking.paymentIntentId) {
    await refundPayment(booking.paymentIntentId);
    refunded = true;
  }

  booking.status = 'cancelled';
  booking.holdExpiresAt = undefined;
  await booking.save();

  const seatIds = booking.seats.map((seat) => seat.id);

  // Atomically release the booking's seats back to 'available'
  await Showtime.updateOne(
    { _id: booking.showtimeRef },
    {
      $set: {
        'seats.$[elem].status': 'available',
      },
    },
    {
      arrayFilters: [{ 'elem.id': { $in: seatIds } }],
    }
  );

  // Broadcast seat release to connected clients
  broadcastShowtimeSeatsUpdated(booking.showtimeRef.toString(), seatIds, 'available');

  if (wasConfirmed) {
    const user = await User.findById(booking.userRef);
    if (user) {
      notifyBookingCancelled({ user, booking, refunded });
    }
  }

  return booking;
}

/**
 * Get a single booking by id, scoped to its owner unless the caller is an admin.
 * @param {object} params
 * @param {string} params.bookingId
 * @param {string} params.userId
 * @param {string} params.role
 * @returns {Promise<object>}
 */
export async function getBookingById({ bookingId, userId, role }) {
  const booking = await Booking.findById(bookingId)
    .populate('userRef', 'name email')
    .populate('showtimeRef', 'screenName startsAt status filmRef cinemaRef');

  if (!booking) {
    throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
  }

  if (role !== 'admin' && booking.userRef?._id?.toString() !== userId.toString()) {
    throw new AppError('Forbidden: you can only view your own bookings', 403, 'FORBIDDEN');
  }

  return booking;
}

/**
 * Get bookings for the authenticated user (FR-18)
 * @param {string} userId
 * @param {object} queryParams
 * @returns {Promise<{ items: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function getUserBookings(userId, queryParams = {}) {
  const { page = 1, limit = 10 } = queryParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [bookings, total] = await Promise.all([
    Booking.find({ userRef: userId })
      .populate('showtimeRef', 'screenName startsAt status filmRef cinemaRef')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Booking.countDocuments({ userRef: userId }),
  ]);

  return {
    items: bookings,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

/**
 * Get all bookings across showtimes for Admin (FR-24, FR-25)
 * @param {object} queryParams
 * @returns {Promise<{ items: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function getAllBookings(queryParams = {}) {
  const { showtimeId, page = 1, limit = 20 } = queryParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  if (showtimeId) {
    filter.showtimeRef = showtimeId;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('userRef', 'name email')
      .populate('showtimeRef', 'screenName startsAt status filmRef cinemaRef')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Booking.countDocuments(filter),
  ]);

  return {
    items: bookings,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}
