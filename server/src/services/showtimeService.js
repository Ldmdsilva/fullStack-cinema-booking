import Showtime from '../models/Showtime.js';
import Film from '../models/Film.js';
import Cinema from '../models/Cinema.js';
import { getScreen } from './cinemaService.js';
import { tierPrice } from '../config/seatTiers.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import { serializeShowtimeSummary, serializeShowtimeDetail } from '../serializers/showtimeSerializer.js';

// Limited projections for populate() — a listing/detail read must never drag
// a screen's up-to-300-seat layout (Cinema.screens) over the wire just to
// show which cinema/screen a showtime belongs to (§C6.2).
const FILM_REF_FIELDS = 'title posterUrl certificate runtimeMinutes';
const CINEMA_REF_FIELDS = 'name city';

// Screen `seatLayout[].section` is a free-text string set by whoever built
// the cinema's screen — it does NOT carry a tier directly. This lookup maps
// known section names (case-insensitively) to a seat tier; anything else
// defaults to STANDARD (see the warning log in `deriveSeatsFromScreen`).
const SECTION_TO_TIER = {
  standard: 'STANDARD',
  premium: 'PREMIUM',
  recliner: 'RECLINER',
};

/**
 * Derive a showtime's seat array from a screen's `seatLayout`, assigning
 * each seat a tier (via `SECTION_TO_TIER`, defaulting to STANDARD with a
 * warning log for an unrecognised section name) and a frozen price
 * (`tierPrice(basePrice, tier)`) — computed once here, never recomputed
 * later even if `basePrice` changes (§C6.2, D8).
 * Exported so `scripts/seed.js` can build believable showtime seat data
 * from a cinema screen's `seatLayout` without duplicating the
 * `SECTION_TO_TIER`/pricing logic.
 * @param {object} screen
 * @param {number} basePrice
 * @returns {Array}
 */
export function deriveSeatsFromScreen(screen, basePrice) {
  return screen.seatLayout.map((layoutSeat) => {
    const tier = SECTION_TO_TIER[layoutSeat.section?.toLowerCase()];
    const resolvedTier = tier || 'STANDARD';

    if (!tier) {
      logger.warn(
        { screenId: screen.screenId, seatId: layoutSeat.id, section: layoutSeat.section },
        '[showtimeService] Unrecognised seat section; defaulting to STANDARD tier'
      );
    }

    return {
      id: layoutSeat.id,
      section: layoutSeat.section,
      row: layoutSeat.row,
      number: layoutSeat.number,
      tier: resolvedTier,
      price: tierPrice(basePrice, resolvedTier),
      status: 'available',
    };
  });
}

/**
 * Retrieve upcoming showtimes with pagination and filtering (FR-19–21).
 * Past showtimes are excluded by default (`from` defaults to now), and
 * cancelled showtimes are never listed.
 * @param {object} queryParams
 * @returns {Promise<{ items: Array, total: number, page: number, limit: number, totalPages: number }>}
 */
export async function listShowtimes(queryParams = {}) {
  const { page = 1, limit = 20, filmId, cinemaId, from, to } = queryParams;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { status: 'scheduled' };

  const fromDate = from ? new Date(from) : new Date();
  if (isNaN(fromDate.getTime())) {
    throw new AppError('Invalid from date parameter', 400, 'INVALID_FILTER');
  }
  filter.startsAt = { $gte: fromDate };

  if (to) {
    const toDate = new Date(to);
    if (isNaN(toDate.getTime())) {
      throw new AppError('Invalid to date parameter', 400, 'INVALID_FILTER');
    }
    filter.startsAt.$lte = toDate;
  }

  if (filmId) {
    filter.filmRef = filmId;
  }

  if (cinemaId) {
    filter.cinemaRef = cinemaId;
  }

  const [showtimes, total] = await Promise.all([
    Showtime.find(filter)
      .populate('filmRef', FILM_REF_FIELDS)
      .populate('cinemaRef', CINEMA_REF_FIELDS)
      .sort({ startsAt: 1 })
      .skip(skip)
      .limit(limitNum),
    Showtime.countDocuments(filter),
  ]);

  return {
    items: showtimes.map((showtime) => serializeShowtimeSummary(showtime)),
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

/**
 * Retrieve a single showtime with its full seat map (FR-20, FR-26).
 * @param {string} id
 * @param {Date} [now]
 * @returns {Promise<object>}
 */
export async function getShowtimeById(id, now = new Date()) {
  const showtime = await Showtime.findById(id)
    .populate('filmRef', FILM_REF_FIELDS)
    .populate('cinemaRef', CINEMA_REF_FIELDS);

  if (!showtime) {
    throw new AppError('Showtime not found', 404, 'SHOWTIME_NOT_FOUND');
  }

  return serializeShowtimeDetail(showtime, now);
}

/**
 * Create a new showtime, deriving its seat array from the cinema screen's
 * seat layout (FR-24, §C6.2).
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function createShowtime({ filmRef, cinemaRef, screenId, startsAt, basePrice }) {
  if (!filmRef || !cinemaRef || !screenId || !startsAt || basePrice === undefined) {
    throw new AppError(
      'filmRef, cinemaRef, screenId, startsAt, and basePrice are required',
      400,
      'VALIDATION_ERROR'
    );
  }

  const startsAtDate = new Date(startsAt);
  if (isNaN(startsAtDate.getTime())) {
    throw new AppError('Invalid startsAt date format', 400, 'VALIDATION_ERROR');
  }

  if (startsAtDate <= new Date()) {
    throw new AppError('Showtime startsAt must be in the future', 400, 'VALIDATION_ERROR', {
      field: 'startsAt',
    });
  }

  const film = await Film.findById(filmRef);
  if (!film) {
    throw new AppError('Film not found', 404, 'FILM_NOT_FOUND');
  }

  const cinema = await Cinema.findById(cinemaRef);
  if (!cinema) {
    throw new AppError('Cinema not found', 404, 'CINEMA_NOT_FOUND');
  }

  // Propagates SCREEN_NOT_FOUND (404) if screenId isn't on this cinema.
  const screen = getScreen(cinema, screenId);

  const seats = deriveSeatsFromScreen(screen, Number(basePrice));

  const showtime = await Showtime.create({
    filmRef: film._id,
    cinemaRef: cinema._id,
    screenId: screen.screenId,
    screenName: screen.name,
    startsAt: startsAtDate,
    basePrice: Number(basePrice),
    seats,
    status: 'scheduled',
  });

  const populated = await Showtime.findById(showtime._id)
    .populate('filmRef', FILM_REF_FIELDS)
    .populate('cinemaRef', CINEMA_REF_FIELDS);

  return serializeShowtimeDetail(populated);
}

/**
 * Cancel a showtime (FR-24). Only flips the status flag — booking
 * cancellation/refund cascading for already-confirmed bookings on this
 * showtime is intentionally out of scope here; see `bookingService.
 * cancelBooking` for the per-booking cascade.
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function cancelShowtime(id) {
  const showtime = await Showtime.findByIdAndUpdate(
    id,
    { status: 'cancelled' },
    { returnDocument: 'after', runValidators: true }
  )
    .populate('filmRef', FILM_REF_FIELDS)
    .populate('cinemaRef', CINEMA_REF_FIELDS);

  if (!showtime) {
    throw new AppError('Showtime not found', 404, 'SHOWTIME_NOT_FOUND');
  }

  return serializeShowtimeDetail(showtime);
}
