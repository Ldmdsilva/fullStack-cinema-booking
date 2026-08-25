import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Compute the total price for a set of requested seats on a showtime, and
 * the currency it's denominated in. This is the anti-tampering guard a
 * later phase's hold/confirm flow calls: it takes NO client-supplied
 * amount as input, so the server is always the source of truth for price.
 *
 * Reads each seat's STORED `price` (frozen at showtime-creation time) —
 * never recomputes from `basePrice`/tier here, since a later `basePrice`
 * edit must never retroactively change an already-published showtime's
 * seat prices.
 * @param {object} showtime - a Showtime document (or plain object with a `seats` array)
 * @param {string[]} seatIds - requested seat ids
 * @returns {{ totalPrice: number, currency: string }}
 */
export function computeSeatTotal(showtime, seatIds) {
  const seats = showtime?.seats || [];
  const seatsById = new Map(seats.map((seat) => [seat.id, seat]));

  let totalPrice = 0;
  for (const seatId of seatIds) {
    const seat = seatsById.get(seatId);
    if (!seat) {
      throw new AppError('One or more requested seats were not found on this showtime', 400, 'SEAT_NOT_FOUND');
    }
    totalPrice += seat.price;
  }

  return { totalPrice, currency: env.STRIPE_CURRENCY.toUpperCase() };
}
