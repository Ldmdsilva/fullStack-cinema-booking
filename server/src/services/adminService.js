import Showtime from '../models/Showtime.js';
import Booking from '../models/Booking.js';
import { serializeShowtimeSummary } from '../serializers/showtimeSerializer.js';

/**
 * Aggregate dashboard statistics across all showtimes and bookings (FR-25).
 * @returns {Promise<object>}
 */
export async function getStats() {
  const [totalShowtimes, upcomingShowtimes, totalBookings, confirmedBookings, cancelledBookings, revenueAgg, seatAgg] =
    await Promise.all([
      Showtime.countDocuments({}),
      Showtime.countDocuments({ status: 'scheduled' }),
      Booking.countDocuments({}),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      Showtime.aggregate([
        {
          $project: {
            totalSeats: { $size: '$seats' },
            bookedSeats: {
              $size: {
                $filter: { input: '$seats', as: 's', cond: { $eq: ['$$s.status', 'booked'] } },
              },
            },
          },
        },
        { $group: { _id: null, totalSeats: { $sum: '$totalSeats' }, bookedSeats: { $sum: '$bookedSeats' } } },
      ]),
    ]);

  const totalRevenue = revenueAgg[0]?.total || 0;
  const totalSeats = seatAgg[0]?.totalSeats || 0;
  const bookedSeats = seatAgg[0]?.bookedSeats || 0;

  return {
    totalShowtimes,
    upcomingShowtimes,
    totalBookings,
    confirmedBookings,
    cancelledBookings,
    totalRevenue,
    totalSeats,
    bookedSeats,
    availableSeats: totalSeats - bookedSeats,
    occupancyRate: totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 100) : 0,
  };
}

/**
 * List every showtime (including cancelled and past) with revenue and
 * booking count derived from confirmed bookings, for the admin showtimes
 * table (FR-25). Never populates `cinemaRef.screens` — a listing must never
 * drag up to 300 seats per screen over the wire (§C6.2).
 * @param {object} queryParams
 * @returns {Promise<{ items: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function listAdminShowtimes(queryParams = {}) {
  const { page = 1, limit = 20 } = queryParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [showtimes, total] = await Promise.all([
    Showtime.find({})
      .populate('filmRef', 'title posterUrl')
      .populate('cinemaRef', 'name city')
      .sort({ startsAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Showtime.countDocuments({}),
  ]);

  const showtimeIds = showtimes.map((showtime) => showtime._id);
  const revenueByShowtime = await Booking.aggregate([
    { $match: { showtimeRef: { $in: showtimeIds }, status: 'confirmed' } },
    { $group: { _id: '$showtimeRef', revenue: { $sum: '$totalPrice' }, bookingCount: { $sum: 1 } } },
  ]);
  const statsByShowtimeId = new Map(revenueByShowtime.map((row) => [row._id.toString(), row]));

  return {
    items: showtimes.map((showtime) => {
      const stats = statsByShowtimeId.get(showtime._id.toString());
      return {
        ...serializeShowtimeSummary(showtime),
        revenue: stats?.revenue || 0,
        bookingCount: stats?.bookingCount || 0,
      };
    }),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}
